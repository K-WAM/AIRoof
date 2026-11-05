# View as

The platform superadmin can open a client's app from Admin > Clients > View as.
Choose Owner, Office staff, Inspector, Technician, Field crew or View only, or
an active team member. Field choices appear only when the industry and purchased
products include Jobs. The company navigation, landing screen and server access
checks use the selected role, trade and crew. A banner identifies the view;
Exit returns to Clients. Admin tabs keep their normal platform access.

This is a read-only projection, never impersonation. The Firebase sign-in stays
the platform account; no custom token is minted and no action is attributed to
the selected person. Write attempts return "View as is read-only. Exit to make
changes." Customer emails, texts, confirmations and other mutations are blocked
by the same gate. Feedback is hidden and analytics/offline write replay are
disabled for the projected profile.

The server stores a 60-minute session in the server-only viewAsSessions
collection. A 256-bit random id is carried only in an HttpOnly, SameSite=Strict
cookie (Secure outside development). The resolver verifies the caller's live
superadmin claim, original uid, tenant, expiry and endedAt. Its bounded cache
lasts at most 30 seconds; Exit evicts the local entry and ends the document.
Other server instances can retain an ended record for that 30-second window;
the cookie is cleared immediately in the browser. Session ids are never returned
in JSON, profile data or audit records.

Central role, own-business, field and product guards enforce the viewed member's
permissions for the selected tenant. A field cookie cannot bypass the read-only
gate. Other tenants and /api/admin retain existing superadmin behavior, so the
Admin pages keep working in another tab. Platform-only routes that can act on a
customer (/api/tools/execute and the agent test endpoints) also refuse writes
during a view-as session. Start and end are audited under the real platform uid.
Sign-out also clears the HttpOnly cookie through the server. Firestore rules
deny all client access to sessions, including client SDKs holding a superadmin
claim.
