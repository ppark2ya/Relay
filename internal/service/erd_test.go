package service

import (
	"encoding/json"
	"strings"
	"testing"
)

const sampleErdDSL = `{
  "packageName": "com.example.domain",
  "entities": [
    {
      "name": "User",
      "table": "users",
      "fields": [
        { "name": "id", "type": "Long", "id": true },
        { "name": "email", "type": "String", "nullable": false, "unique": true }
      ]
    },
    {
      "name": "Order",
      "table": "orders",
      "fields": [
        { "name": "id", "type": "Long", "id": true },
        { "name": "amount", "type": "BigDecimal", "nullable": false }
      ]
    }
  ],
  "relations": [
    {
      "from": "Order",
      "to": "User",
      "type": "many-to-one",
      "field": "user",
      "joinColumn": "user_id",
      "nullable": false
    }
  ]
}`

func TestParseErdDSL_ValidatesRelationsAndIds(t *testing.T) {
	doc, diagnostics := ParseErdDSL(sampleErdDSL)
	if len(diagnostics) != 0 {
		t.Fatalf("expected no diagnostics, got %#v", diagnostics)
	}
	if doc.PackageName != "com.example.domain" {
		t.Fatalf("unexpected package name: %q", doc.PackageName)
	}
	if len(doc.Entities) != 2 {
		t.Fatalf("expected 2 entities, got %d", len(doc.Entities))
	}
}

func TestParseErdDSL_ReportsInvalidReferences(t *testing.T) {
	_, diagnostics := ParseErdDSL(`{
	  "entities": [
	    { "name": "Order", "fields": [{ "name": "id", "type": "Long", "id": true }] }
	  ],
	  "relations": [
	    { "from": "Order", "to": "Missing", "type": "many-to-one", "field": "missing" }
	  ]
	}`)

	if len(diagnostics) == 0 {
		t.Fatal("expected diagnostics for missing relation target")
	}
	if !strings.Contains(diagnostics[0].Message, "Missing") {
		t.Fatalf("expected diagnostic to mention Missing, got %q", diagnostics[0].Message)
	}
}

func TestGenerateMermaidERD_IncludesFieldsAndRelationLines(t *testing.T) {
	doc, diagnostics := ParseErdDSL(sampleErdDSL)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	mermaid := GenerateMermaidERD(doc)

	for _, want := range []string{
		"erDiagram",
		"User {",
		"String email",
		"Order }o--|| User : user",
	} {
		if !strings.Contains(mermaid, want) {
			t.Fatalf("expected Mermaid output to contain %q:\n%s", want, mermaid)
		}
	}
}

func TestGenerateErdDiagram_IncludesEntitiesAndRelations(t *testing.T) {
	doc, diagnostics := ParseErdDSL(sampleErdDSL)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	diagram := GenerateErdDiagram(doc)

	if len(diagram.Entities) != 2 {
		t.Fatalf("expected 2 diagram entities, got %d", len(diagram.Entities))
	}
	if diagram.Entities[0].Name != "User" {
		t.Fatalf("expected first entity User, got %q", diagram.Entities[0].Name)
	}
	assertDiagramColumn(t, diagram.Entities[0], 0, ErdDiagramColumn{
		Keys:     []string{"PK"},
		Name:     "id",
		Type:     "BIGINT",
		Nullable: false,
	})
	assertDiagramColumn(t, diagram.Entities[0], 1, ErdDiagramColumn{
		Keys:     []string{"UK"},
		Name:     "email",
		Type:     "VARCHAR(255)",
		Nullable: false,
	})
	assertDiagramColumn(t, diagram.Entities[1], 1, ErdDiagramColumn{
		Keys:     []string{},
		Name:     "amount",
		Type:     "DECIMAL(19,2)",
		Nullable: false,
	})
	assertDiagramColumn(t, diagram.Entities[1], 2, ErdDiagramColumn{
		Keys:     []string{"FK"},
		Name:     "user_id",
		Type:     "BIGINT",
		Nullable: false,
	})

	if len(diagram.Relations) != 1 {
		t.Fatalf("expected 1 diagram relation, got %d", len(diagram.Relations))
	}
	relation := diagram.Relations[0]
	if relation.From != "Order" || relation.FromCardinality != "O<" || relation.To != "User" || relation.ToCardinality != "||" || relation.Label != "user" {
		t.Fatalf("unexpected relation: %#v", relation)
	}
}

func TestGenerateErdDiagram_MarksModifiedFieldAndRelationColumns(t *testing.T) {
	doc, diagnostics := ParseErdDSL(`{
	  "entities": [
	    {
	      "name": "User",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "email", "type": "String", "nullable": false, "modify": true }
	      ]
	    },
	    {
	      "name": "Order",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true }
	      ]
	    }
	  ],
	  "relations": [
	    { "from": "Order", "to": "User", "type": "many-to-one", "field": "user", "joinColumn": "user_id", "modify": true }
	  ]
	}`)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	diagram := GenerateErdDiagram(doc)

	assertDiagramColumn(t, diagram.Entities[0], 1, ErdDiagramColumn{
		Keys:     []string{},
		Name:     "email",
		Type:     "VARCHAR(255)",
		Nullable: false,
		Modified: true,
	})
	assertDiagramColumn(t, diagram.Entities[1], 1, ErdDiagramColumn{
		Keys:     []string{"FK"},
		Name:     "user_id",
		Type:     "BIGINT",
		Nullable: true,
		Modified: true,
	})
}

func TestGenerateErdDiagram_MergesModifiedForeignKeyWithScalarColumn(t *testing.T) {
	doc, diagnostics := ParseErdDSL(`{
	  "entities": [
	    {
	      "name": "User",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true }
	      ]
	    },
	    {
	      "name": "Order",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "userId", "column": "user_id", "type": "Long", "nullable": false }
	      ]
	    }
	  ],
	  "relations": [
	    { "from": "Order", "to": "User", "type": "many-to-one", "field": "user", "joinColumn": "user_id", "nullable": false, "modify": true }
	  ]
	}`)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	diagram := GenerateErdDiagram(doc)

	assertDiagramColumn(t, diagram.Entities[1], 1, ErdDiagramColumn{
		Keys:     []string{"FK"},
		Name:     "user_id",
		Type:     "BIGINT",
		Nullable: false,
		Modified: true,
	})
}

func TestGenerateCode_IgnoresModifyFlag(t *testing.T) {
	doc, diagnostics := ParseErdDSL(`{
	  "packageName": "com.example.domain",
	  "entities": [
	    {
	      "name": "User",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "email", "type": "String", "modify": true }
	      ]
	    },
	    {
	      "name": "Order",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true }
	      ]
	    }
	  ],
	  "relations": [
	    { "from": "Order", "to": "User", "type": "many-to-one", "field": "user", "joinColumn": "user_id", "modify": true }
	  ]
	}`)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	var generated strings.Builder
	for _, file := range GenerateKotlinEntities(doc) {
		generated.WriteString(file.Content)
	}
	for _, file := range GenerateJavaEntities(doc) {
		generated.WriteString(file.Content)
	}
	for _, file := range GenerateMySQLDDL(doc) {
		generated.WriteString(file.Content)
	}

	output := strings.ToLower(generated.String())
	if strings.Contains(output, "modify") || strings.Contains(output, "modified") {
		t.Fatalf("expected generated code to ignore modify metadata:\n%s", generated.String())
	}
}

func assertDiagramColumn(t *testing.T, entity ErdDiagramEntity, index int, want ErdDiagramColumn) {
	t.Helper()
	if len(entity.Columns) <= index {
		t.Fatalf("expected entity %s to have column index %d, got %#v", entity.Name, index, entity.Columns)
	}
	got := entity.Columns[index]
	if (got.Keys == nil) != (want.Keys == nil) ||
		strings.Join(got.Keys, ",") != strings.Join(want.Keys, ",") ||
		got.Name != want.Name ||
		got.Type != want.Type ||
		got.Nullable != want.Nullable ||
		got.Modified != want.Modified {
		t.Fatalf("unexpected column at %s[%d]: got %#v want %#v", entity.Name, index, got, want)
	}
}

func TestGenerateKotlinEntities_UsesJakartaAndRelations(t *testing.T) {
	doc, diagnostics := ParseErdDSL(sampleErdDSL)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	files := GenerateKotlinEntities(doc)
	if len(files) != 2 {
		t.Fatalf("expected 2 generated files, got %d", len(files))
	}

	var orderContent string
	for _, file := range files {
		if file.Path == "com/example/domain/Order.kt" {
			orderContent = file.Content
			break
		}
	}
	if orderContent == "" {
		t.Fatal("expected Order.kt to be generated")
	}

	for _, want := range []string{
		"package com.example.domain",
		"import jakarta.persistence.*",
		"@Entity",
		"@Table(name = \"orders\")",
		"open class Order(",
		"@ManyToOne(fetch = FetchType.LAZY, optional = false)",
		"@JoinColumn(name = \"user_id\", nullable = false)",
		"open var user: User",
	} {
		if !strings.Contains(orderContent, want) {
			t.Fatalf("expected Kotlin output to contain %q:\n%s", want, orderContent)
		}
	}
}

func TestGenerateJavaEntities_UsesLombokBuilderAndRelations(t *testing.T) {
	doc, diagnostics := ParseErdDSL(`{
	  "packageName": "com.example.domain",
	  "entities": [
	    {
	      "name": "User",
	      "table": "users",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "email", "type": "String", "nullable": false, "unique": true }
	      ]
	    },
	    {
	      "name": "Order",
	      "table": "orders",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "amount", "type": "BigDecimal", "nullable": false },
	        { "name": "createdAt", "type": "LocalDateTime", "nullable": false }
	      ]
	    }
	  ],
	  "relations": [
	    { "from": "User", "to": "Order", "type": "one-to-many", "field": "orders" },
	    { "from": "Order", "to": "User", "type": "many-to-one", "field": "user", "joinColumn": "user_id", "nullable": false }
	  ]
	}`)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	files := GenerateJavaEntities(doc)
	if len(files) != 2 {
		t.Fatalf("expected 2 generated files, got %d", len(files))
	}

	var orderContent, userContent string
	for _, file := range files {
		switch file.Path {
		case "com/example/domain/Order.java":
			orderContent = file.Content
		case "com/example/domain/User.java":
			userContent = file.Content
		}
	}
	if orderContent == "" {
		t.Fatal("expected Order.java to be generated")
	}
	if userContent == "" {
		t.Fatal("expected User.java to be generated")
	}

	for _, want := range []string{
		"package com.example.domain;",
		"import jakarta.persistence.*;",
		"import java.math.BigDecimal;",
		"import java.time.LocalDateTime;",
		"import lombok.AccessLevel;",
		"import lombok.AllArgsConstructor;",
		"import lombok.Builder;",
		"import lombok.Getter;",
		"import lombok.NoArgsConstructor;",
		"import lombok.Setter;",
		"@Getter",
		"@Setter",
		"@Builder",
		"@NoArgsConstructor(access = AccessLevel.PROTECTED)",
		"@AllArgsConstructor",
		"@Entity",
		"@Table(name = \"orders\")",
		"public class Order {",
		"@Id",
		"@GeneratedValue(strategy = GenerationType.IDENTITY)",
		"@Column(name = \"amount\", nullable = false)",
		"private BigDecimal amount;",
		"@Column(name = \"created_at\", nullable = false)",
		"private LocalDateTime createdAt;",
		"@ManyToOne(fetch = FetchType.LAZY, optional = false)",
		"@JoinColumn(name = \"user_id\", nullable = false)",
		"private User user;",
	} {
		if !strings.Contains(orderContent, want) {
			t.Fatalf("expected Java output to contain %q:\n%s", want, orderContent)
		}
	}

	for _, want := range []string{
		"import java.util.ArrayList;",
		"import java.util.List;",
		"@OneToMany",
		"@Builder.Default",
		"private List<Order> orders = new ArrayList<>();",
	} {
		if !strings.Contains(userContent, want) {
			t.Fatalf("expected Java output to contain %q:\n%s", want, userContent)
		}
	}
	for _, notWant := range []string{
		"import java.math.BigDecimal;",
		"import java.time.LocalDateTime;",
	} {
		if strings.Contains(userContent, notWant) {
			t.Fatalf("expected User.java not to contain %q:\n%s", notWant, userContent)
		}
	}
}

func TestErdFieldOptions_CustomizePreviewJpaAndMySQLDDL(t *testing.T) {
	doc, diagnostics := ParseErdDSL(`{
	  "packageName": "com.example.domain",
	  "entities": [
	    {
	      "name": "Product",
	      "table": "products",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "sku", "type": "String", "length": 64, "nullable": false, "index": true },
	        { "name": "price", "type": "BigDecimal", "precision": 12, "scale": 4, "nullable": false }
	      ]
	    }
	  ]
	}`)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	diagram := GenerateErdDiagram(doc)
	if len(diagram.Entities) != 1 {
		t.Fatalf("expected 1 diagram entity, got %d", len(diagram.Entities))
	}
	assertDiagramColumn(t, diagram.Entities[0], 1, ErdDiagramColumn{
		Keys:     []string{"IX"},
		Name:     "sku",
		Type:     "VARCHAR(64)",
		Nullable: false,
	})
	assertDiagramColumn(t, diagram.Entities[0], 2, ErdDiagramColumn{
		Keys:     []string{},
		Name:     "price",
		Type:     "DECIMAL(12,4)",
		Nullable: false,
	})

	kotlin := GenerateKotlinEntities(doc)[0].Content
	for _, want := range []string{
		"@Table(name = \"products\", indexes = [Index(name = \"idx_products_sku\", columnList = \"sku\")])",
		"@Column(name = \"sku\", nullable = false, length = 64)",
		"@Column(name = \"price\", nullable = false, precision = 12, scale = 4)",
	} {
		if !strings.Contains(kotlin, want) {
			t.Fatalf("expected Kotlin output to contain %q:\n%s", want, kotlin)
		}
	}

	java := GenerateJavaEntities(doc)[0].Content
	for _, want := range []string{
		"@Table(name = \"products\", indexes = { @Index(name = \"idx_products_sku\", columnList = \"sku\") })",
		"@Column(name = \"sku\", nullable = false, length = 64)",
		"@Column(name = \"price\", nullable = false, precision = 12, scale = 4)",
	} {
		if !strings.Contains(java, want) {
			t.Fatalf("expected Java output to contain %q:\n%s", want, java)
		}
	}

	ddl := GenerateMySQLDDL(doc)[0].Content
	for _, want := range []string{
		"`sku` VARCHAR(64) NOT NULL",
		"`price` DECIMAL(12,4) NOT NULL",
		"KEY `idx_products_sku` (`sku`)",
	} {
		if !strings.Contains(ddl, want) {
			t.Fatalf("expected MySQL DDL to contain %q:\n%s", want, ddl)
		}
	}
}

func TestGenerateMySQLDDL_CreatesTablesKeysAndOwningForeignKeys(t *testing.T) {
	doc, diagnostics := ParseErdDSL(`{
	  "entities": [
	    {
	      "name": "User",
	      "table": "users",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "email", "type": "String", "column": "email_address", "nullable": false, "unique": true }
	      ]
	    },
	    {
	      "name": "Order",
	      "table": "orders",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "amount", "type": "BigDecimal", "nullable": false }
	      ]
	    }
	  ],
	  "relations": [
	    { "from": "Order", "to": "User", "type": "many-to-one", "field": "user", "joinColumn": "user_id", "nullable": false }
	  ]
	}`)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	files := GenerateMySQLDDL(doc)
	if len(files) != 1 {
		t.Fatalf("expected 1 generated file, got %d", len(files))
	}
	if files[0].Path != "schema.mysql.sql" {
		t.Fatalf("expected schema.mysql.sql, got %q", files[0].Path)
	}

	content := files[0].Content
	for _, want := range []string{
		"CREATE TABLE `users` (",
		"`id` BIGINT NOT NULL AUTO_INCREMENT",
		"`email_address` VARCHAR(255) NOT NULL",
		"PRIMARY KEY (`id`)",
		"UNIQUE KEY `uk_users_email_address` (`email_address`)",
		") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
		"CREATE TABLE `orders` (",
		"`amount` DECIMAL(19,2) NOT NULL",
		"`user_id` BIGINT NOT NULL",
		"KEY `idx_orders_user_id` (`user_id`)",
		"CONSTRAINT `fk_orders_user_id_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)",
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("expected MySQL DDL to contain %q:\n%s", want, content)
		}
	}
}

func TestGenerateMySQLDDL_DoesNotCreateTablesForCollectionRelations(t *testing.T) {
	doc, diagnostics := ParseErdDSL(`{
	  "entities": [
	    { "name": "User", "fields": [{ "name": "id", "type": "Long", "id": true }] },
	    { "name": "Order", "fields": [{ "name": "id", "type": "Long", "id": true }] },
	    { "name": "Role", "fields": [{ "name": "id", "type": "Long", "id": true }] }
	  ],
	  "relations": [
	    { "from": "User", "to": "Order", "type": "one-to-many", "field": "orders" },
	    { "from": "User", "to": "Role", "type": "many-to-many", "field": "roles" }
	  ]
	}`)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	files := GenerateMySQLDDL(doc)
	if len(files) != 1 {
		t.Fatalf("expected 1 generated file, got %d", len(files))
	}

	content := files[0].Content
	for _, notWant := range []string{
		"`orders_id`",
		"`roles_id`",
		"CREATE TABLE `user_roles`",
		"CREATE TABLE `users_roles`",
		"FOREIGN KEY",
	} {
		if strings.Contains(content, notWant) {
			t.Fatalf("expected MySQL DDL not to contain %q:\n%s", notWant, content)
		}
	}
}

func TestErdComments_ArePreservedGeneratedAndHiddenFromPreview(t *testing.T) {
	doc, diagnostics := ParseErdDSL(`{
	  "packageName": "com.example.domain",
	  "entities": [
	    {
	      "name": "User",
	      "table": "users",
	      "comment": "Application user account",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "email", "type": "String", "nullable": false, "unique": true, "comment": "Login email address" }
	      ]
	    },
	    {
	      "name": "Order",
	      "table": "orders",
	      "comment": "Purchase order record",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "amount", "type": "BigDecimal", "nullable": false, "comment": "Amount charged to the customer" }
	      ]
	    }
	  ],
	  "relations": [
	    {
	      "from": "Order",
	      "to": "User",
	      "type": "many-to-one",
	      "field": "user",
	      "joinColumn": "user_id",
	      "nullable": false,
	      "comment": "Customer who placed the order"
	    }
	  ]
	}`)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	encoded, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal parsed DSL: %v", err)
	}
	for _, want := range []string{
		"Application user account",
		"Login email address",
		"Customer who placed the order",
	} {
		if !strings.Contains(string(encoded), want) {
			t.Fatalf("expected parsed DSL to preserve %q, got %s", want, string(encoded))
		}
	}

	var kotlinOrder string
	for _, file := range GenerateKotlinEntities(doc) {
		if file.Path == "com/example/domain/Order.kt" {
			kotlinOrder = file.Content
			break
		}
	}
	for _, want := range []string{
		" * Purchase order record",
		" * Amount charged to the customer",
		" * Customer who placed the order",
	} {
		if !strings.Contains(kotlinOrder, want) {
			t.Fatalf("expected Kotlin output to contain %q:\n%s", want, kotlinOrder)
		}
	}

	var javaOrder string
	for _, file := range GenerateJavaEntities(doc) {
		if file.Path == "com/example/domain/Order.java" {
			javaOrder = file.Content
			break
		}
	}
	for _, want := range []string{
		" * Purchase order record",
		" * Amount charged to the customer",
		" * Customer who placed the order",
	} {
		if !strings.Contains(javaOrder, want) {
			t.Fatalf("expected Java output to contain %q:\n%s", want, javaOrder)
		}
	}

	ddl := GenerateMySQLDDL(doc)[0].Content
	for _, want := range []string{
		"`amount` DECIMAL(19,2) NOT NULL COMMENT 'Amount charged to the customer'",
		"`user_id` BIGINT NOT NULL COMMENT 'Customer who placed the order'",
		") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Purchase order record';",
	} {
		if !strings.Contains(ddl, want) {
			t.Fatalf("expected MySQL DDL to contain %q:\n%s", want, ddl)
		}
	}

	mermaid := GenerateMermaidERD(doc)
	diagram := GenerateErdDiagram(doc)
	previewPayload, err := json.Marshal(diagram)
	if err != nil {
		t.Fatalf("marshal preview diagram: %v", err)
	}
	for _, notWant := range []string{
		"Application user account",
		"Login email address",
		"Purchase order record",
		"Amount charged to the customer",
		"Customer who placed the order",
	} {
		if strings.Contains(mermaid, notWant) {
			t.Fatalf("expected Mermaid output not to contain %q:\n%s", notWant, mermaid)
		}
		if strings.Contains(string(previewPayload), notWant) {
			t.Fatalf("expected preview diagram not to contain %q:\n%s", notWant, string(previewPayload))
		}
	}
}

func TestGenerateMySQLDDL_EscapesCommentStringLiterals(t *testing.T) {
	doc, diagnostics := ParseErdDSL(`{
	  "entities": [
	    {
	      "name": "User",
	      "table": "users",
	      "comment": "User's account table",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true },
	        { "name": "email", "type": "String", "comment": "User's login email" }
	      ]
	    },
	    {
	      "name": "Order",
	      "table": "orders",
	      "fields": [
	        { "name": "id", "type": "Long", "id": true }
	      ]
	    }
	  ],
	  "relations": [
	    {
	      "from": "Order",
	      "to": "User",
	      "type": "many-to-one",
	      "field": "user",
	      "joinColumn": "user_id",
	      "comment": "Order's customer"
	    }
	  ]
	}`)
	if len(diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", diagnostics)
	}

	ddl := GenerateMySQLDDL(doc)[0].Content
	for _, want := range []string{
		"`email` VARCHAR(255) COMMENT 'User''s login email'",
		"`user_id` BIGINT COMMENT 'Order''s customer'",
		") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User''s account table';",
	} {
		if !strings.Contains(ddl, want) {
			t.Fatalf("expected MySQL DDL to contain %q:\n%s", want, ddl)
		}
	}
}
