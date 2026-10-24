// Drizzle ORM 0.45+ natively appends "+0000" when mapping `timestamp without time zone` strings.
// Overriding pg's OID 1114 parser to return a Date object causes Drizzle to produce `Invalid Date`.
export {};
