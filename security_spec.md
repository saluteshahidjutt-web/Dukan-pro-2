# Security Specification - Dukan Pro

## Data Invariants
1. Products, Customers, and Transactions must have an `ownerId` that matches the authenticated user's UID.
2. Settings document must be keyed by the user's UID and contain their `ownerId`.
3. Document IDs must be valid (alphanumeric and within size limits).
4. Critical fields like `ownerId` and `createdAt` must be immutable after creation.
5. All price and amount fields must be non-negative.
6. Transactions must have a valid type.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing**: Attempt to create a product with someone else's `ownerId`.
2. **Resource Poisoning**: Create a document with a 2KB string as an ID.
3. **Privilege Escalation**: Attempt to update another user's shop settings.
4. **State Shortcutting**: Invalidate a transaction by changing its type to an unsupported value.
5. **Orphaned Write**: Create a transaction for a non-existent customer (if checks were implemented, but here we only have owner checks).
6. **Immutable field violation**: Change the `createdAt` timestamp of a transaction.
7. **Negative Values**: Set a product price to -100.
8. **Shadow Field injection**: Add an `isAdmin: true` field to a user settings document.
9. **Blanket Read attempt**: Try to list all products without an `ownerId` filter.
10. **Unauthorized deletion**: Attempt to delete another user's customer record.
11. **Type mismatch**: Send a string for the `stock` field (which should be a number).
12. **Malformed ID**: Use special characters in the document ID.

## Impact Analysis
| Collection | Access Pattern | Principal | Security Guard |
|------------|----------------|-----------|----------------|
| products | get/list/write | Owner | request.auth.uid == resource.data.ownerId |
| customers | get/list/write | Owner | request.auth.uid == resource.data.ownerId |
| transactions | get/list/write | Owner | request.auth.uid == resource.data.ownerId |
| settings | get/write | Owner | request.auth.uid == docId |
