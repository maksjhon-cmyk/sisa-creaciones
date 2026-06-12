# Security Specification: Sisa Creaciones ERP

This document outlines the security boundaries, data invariants, and defensive tests (the "Dirty Dozen") designed to harden our Firestore rules.

## 1. Data Invariants

1. **Role Access Bounds**: 
   - Administrators have complete reading, creation, modification, and deletion access over inventory, financial parameters, and order management.
   - Operators can only see and view production orders explicitly assigned to their `uid` and can only update the order state (`status`) to progress the garment roadmap. They cannot see other operators' private PII, financial fixed costs, or change the quantities/designs of orders.

2. **Self-Assignment Restriction**: No operator is permitted to self-promote to the `admin` role or create an admin account unless bootstrapped using the environment's verified developer email (`maksjhon@gmail.com`).

3. **Temporal Invariants**: `createdAt` timestamps cannot be changed following creation. All database timestamps must align with the server's authoritative clock (`request.time`).

4. **Zero-Trust Client Queries**: Operators must execute queries that filter specifically for `assignedOperatorId == request.auth.uid` or receive immediate `permission_denied` exceptions in the Firestore layer.

---

## 2. The "Dirty Dozen" Threat Vectors & Payloads

Below are the 12 malicious payloads that must return `PERMISSION_DENIED` at the Firestore layer to secure Sisa Creaciones:

### 1. The Rogue Operator Self-Promotion Action
*   **Vector**: An unprivileged user attempts to register their own user profile with role set to `"admin"`.
*   **Target**: `/users/operator_bad_uid`
*   **Payload**: `{ "uid": "operator_bad_uid", "email": "rogue@sisa.com", "name": "Rogue Operator", "role": "admin", "createdAt": "2026-06-03T23:00:00Z" }`

### 2. The Admin Hijack Payload (Updating Role)
*   **Vector**: An existing operator attempts to update their own profile document to elevate their role from `"operator"` to `"admin"`.
*   **Target**: `/users/operator_uid`
*   **Payload**: `{ "role": "admin" }` (via `updateDoc` without checking permissions)

### 3. The PII Scraping Query
*   **Vector**: An operator attempts to list all users in the system to harvest private details and email addresses of other workers.
*   **Target**: Get list of `/users`
*   **Query**: `db.collection('users')` (Without filtering for their own `uid`)

### 4. Raw Material Hijack (Unauthorized Creation)
*   **Vector**: An operator attempts to create or overwrite a raw material item to adjust stock parameters directly.
*   **Target**: `/raw_materials/silk_con_12`
*   **Payload**: `{ "id": "silk_con_12", "name": "Malicious Silk", "category": "Tela", "quantity": 10000, "unit": "metros", "minStock": 10, "costPerUnit": 0.01 }`

### 5. Finished Product Price Deflation Action
*   **Vector**: A user tries to adjust sale price of textile items downward to exploit wholesale sales.
*   **Target**: `/finished_products/premium_jacket`
*   **Payload**: `{ "salePrice": 1.00 }` (Adjusting base jacket from $75 to $1)

### 6. The Production Order Injection Attack
*   **Vector**: An operator or external attacker bypasses the admin route and creates a fake production order.
*   **Target**: `/production_orders/fake_job_999`
*   **Payload**: `{ "id": "fake_job_999", "orderNumber": "ORD-000", "garmentType": "Guantes", "quantity": 10000, "size": "M", "color": "Rojo", "limitDate": "2026-07-01", "status": "Listo" }`

### 7. Production Order Design Modification (State Shortcutting)
*   **Vector**: An assigned operator attempts to modify the garment type, pattern URL, or target quantity of an order to cover up mistake or make less units.
*   **Target**: `/production_orders/active_job_12`
*   **Payload**: `{ "quantity": 10, "garmentType": "Injected Product", "patternUrl": "http://malicious.url" }`

### 8. Denial of Wallet (Resource Poisoning via ID)
*   **Vector**: An attacker attempts to create a document with a massive 100KB garbage ID string to inflate database indices and storage costs.
*   **Target**: `/production_orders/LONG_GARBAGE_ID_STRING_REPEATED_1000_TIMES...`
*   **Payload**: Standard valid schema entity.

### 9. Private Financial Costs Interception
*   **Vector**: An operator attempts to perform a standard search list of corporate fixed costs (rent, executive salaries) to gather business intelligence.
*   **Target**: Get list of `/fixed_costs`
*   **Query**: `db.collection('fixed_costs')`

### 10. Temporal Spoofing (createdAt Override)
*   **Vector**: An attacker attempts to backdate the creation time of an order to escape performance SLAs.
*   **Target**: `/production_orders/order_35` (Updating `createdAt`)
*   **Payload**: `{ "createdAt": "2020-01-01T00:00:00Z" }`

### 11. Complete Product Stock Zeroing Action
*   **Vector**: An operator tries to delete a finished garment entry entirely.
*   **Target**: `/finished_products/jacket_78`
*   **Action**: `delete` request.

### 12. Operator Cross-Contamination View
*   **Vector**: Operator A attempts to directly view or stream updates for a production order currently assigned solely to Operator B.
*   **Target**: `/production_orders/assigned_to_operator_b`
*   **Action**: `get` request from authenticated Operator A.

---

## 3. Test Verification Blueprint

```ts
// Representational Test Suite structure (firestore.rules.test.ts)
// All statements below must assert true in a secure simulation:

import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

// Operator tests
const operatorAuth = { uid: "operator_123", token: { email: "operator@sisa.com", email_verified: true } };
const adminAuth = { uid: "admin_456", token: { email: "maksjhon@gmail.com", email_verified: true } };

// Test 1: Self-promotion fails
await assertFails(operatorDb.doc("users/operator_123").set({ role: "admin", ...others }));

// Test 2: Operator cannot view corporate fixed costs
await assertFails(operatorDb.doc("fixed_costs/rent").get());

// Test 3: Operator can modify only status and updatedAt fields on their assigned order
await assertSucceeds(operatorDb.doc("production_orders/ord_123").update({ status: "Corte", updatedAt: serverTimestamp() }));
await assertFails(operatorDb.doc("production_orders/ord_123").update({ quantity: 50, updatedAt: serverTimestamp() }));
```
