# ERD JSON DSL

Relay ERD documents use a JSON DSL as the source of truth. The DSL generates ERD previews with relationship lines, Kotlin JPA entity files, Java JPA entity files with Lombok for Spring Boot 3 / `jakarta.persistence`, and MySQL `CREATE TABLE` DDL.

## Example

```json
{
  "packageName": "com.example.domain",
  "entities": [
    {
      "name": "User",
      "table": "users",
      "fields": [
        { "name": "id", "type": "Long", "id": true },
        { "name": "email", "type": "String", "length": 320, "nullable": false, "unique": true }
      ]
    },
    {
      "name": "Order",
      "table": "orders",
      "fields": [
        { "name": "id", "type": "Long", "id": true },
        { "name": "amount", "type": "BigDecimal", "precision": 12, "scale": 4, "nullable": false },
        { "name": "status", "type": "String", "length": 32, "nullable": false, "index": true }
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
}
```

## Shape

Entities use `name`, optional `table`, and `fields`. Fields use `name`, `type`, optional `column`, `id`, `nullable`, `unique`, `index`, `length`, `precision`, and `scale`.

`length` applies to `String` fields and defaults to `255`. `precision` and `scale` apply to `BigDecimal` fields and default to `19` and `2`. `index: true` adds an `IX` preview label, JPA table index metadata, and a MySQL `KEY`; it is ignored for primary-key or unique fields because those are already indexed.

Relations use `from`, `to`, `type`, `field`, optional `joinColumn`, and optional `nullable`. Supported relation types are `one-to-one`, `one-to-many`, `many-to-one`, and `many-to-many`.

## Kotlin Generation

The generator emits `open class` entities with `jakarta.persistence.*`, `@Entity`, `@Table`, `@Id`, `@GeneratedValue`, `@Column`, and relation annotations such as `@ManyToOne` and `@JoinColumn`. String `length`, BigDecimal `precision` / `scale`, and scalar `index: true` are reflected in the generated annotations.

## Java Generation

The generator emits Java entities with `jakarta.persistence.*` and Lombok annotations: `@Getter`, `@Setter`, `@Builder`, `@NoArgsConstructor(access = AccessLevel.PROTECTED)`, and `@AllArgsConstructor`. Collection relations are generated as `List<T>` fields with `@Builder.Default` and `new ArrayList<>()`. String `length`, BigDecimal `precision` / `scale`, and scalar `index: true` are reflected in the generated annotations.

## MySQL DDL Generation

The generator emits one `schema.mysql.sql` file with `CREATE TABLE` statements for MySQL 8 / InnoDB. It maps DSL field types to MySQL column types, quotes table/column/constraint names with backticks, emits primary keys, `AUTO_INCREMENT` for single integer primary keys, `NOT NULL`, `UNIQUE KEY`, and scalar `index: true` `KEY` constraints.

String fields default to `VARCHAR(255)` and can be customized with `length`. BigDecimal fields default to `DECIMAL(19,2)` and can be customized with `precision` and `scale`.

Foreign keys follow the same ownership rule as the ERD preview: `many-to-one` and `one-to-one` relations on the source entity generate a FK column, index, and `FOREIGN KEY` constraint. `one-to-many` and `many-to-many` relations do not generate target-side FK columns or join tables in v1. Cascade policies are not generated because the DSL does not currently model them.
