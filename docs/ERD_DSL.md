# ERD JSON DSL

Relay ERD documents use a JSON DSL as the source of truth. The DSL generates ERD previews with relationship lines, Kotlin JPA entity files, and Java JPA entity files with Lombok for Spring Boot 3 / `jakarta.persistence`.

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
}
```

## Shape

Entities use `name`, optional `table`, and `fields`. Fields use `name`, `type`, optional `column`, `id`, `nullable`, and `unique`.

Relations use `from`, `to`, `type`, `field`, optional `joinColumn`, and optional `nullable`. Supported relation types are `one-to-one`, `one-to-many`, `many-to-one`, and `many-to-many`.

## Kotlin Generation

The generator emits `open class` entities with `jakarta.persistence.*`, `@Entity`, `@Table`, `@Id`, `@GeneratedValue`, `@Column`, and relation annotations such as `@ManyToOne` and `@JoinColumn`.

## Java Generation

The generator emits Java entities with `jakarta.persistence.*` and Lombok annotations: `@Getter`, `@Setter`, `@Builder`, `@NoArgsConstructor(access = AccessLevel.PROTECTED)`, and `@AllArgsConstructor`. Collection relations are generated as `List<T>` fields with `@Builder.Default` and `new ArrayList<>()`.
