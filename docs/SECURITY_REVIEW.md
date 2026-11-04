# Security review, Phase 10 (2026-11-04)

Done by reading the code and attacking a production-configured stack locally (Caddy, HTTPS). It is not an external penetration test. Before real candidate data goes in, an independent test is worth having.

## Fixed
| Severity | Finding | Fix |
| -------- | ------- | --- |
| Critical | `dompurify` 3.4.15 through `monaco-editor` had known XSS holes (1 critical, 1 high) | Forced to 3.4.17 or newer with a pnpm override |
| High | The API could start in production on mock AI, so real candidates would get invented scores. Console email would put password reset links in the logs | `ENVIRONMENT=production` refuses to start on mock LLM, STT, TTS, stub sandbox or console email |
| High | Behind the Next.js proxy every request came from one address, so 10 failed logins by anyone blocked login for everybody | `TRUST_FORWARDED_FOR` in production. Checked: a forged `X-Forwarded-For` does not avoid the limit, and another client is not blocked |
| Medium | No security headers | HSTS, CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` in `Caddyfile`. Checked: Monaco, the sockets and all swept pages work under the CSP |
| Medium | Postgres, Redis and the API were published to the host | The production file publishes only Caddy |
| Medium | Password reset was sent during the request, so response time could reveal which addresses have an account once real SMTP is on | Sent after the response |
| Low | `/docs` and `/openapi.json` open everywhere | Closed outside `local` and `test` |
| Low | No limit on request size at the edge | 60 MB in Caddy. Checked: a larger body gets 413 |

## Checked, nothing found
- SQL injection: the application code builds no SQL from strings.
- XSS: no `dangerouslySetInnerHTML`. User text renders as text.
- Admin access: the role check is on the whole router; a test covers every route for anonymous, candidate and HR.
- Uploads: checked by content, size-limited, resumes served as attachments with `nosniff`. Storage keys cannot leave the storage root.
- Sockets check the `Origin` header before accepting.
- Secrets: none in the repository or its history, by pattern search.
- Python dependencies: `pip-audit` found no known vulnerabilities.
- Containers run as a non-root user, apart from Judge0.

## Open, accepted for now
| Severity | Item | Why it is still open |
| -------- | ---- | -------------------- |
| Medium | CSP allows inline scripts | Next.js streams inline scripts; a nonce setup would disable static rendering. The CSP still limits where scripts load from and connect to |
| Medium | Judge0 runs privileged | Its isolation needs it. It has no route to the outside and no published ports. Use a server that holds nothing else |
| Medium | Admins have no second factor | Not in the MVP. Add it before many people have admin access |
| Low | Failed logins per email lock that email for a minute, so someone can keep a known address locked out | It also slows password guessing. Revisit if abused |
| Low | Registration reveals that an email is taken | Usual trade-off for a clear sign-up form |
| Low | `minimatch` (moderate) and `deepmerge` (low) | Only through the `shadcn` CLI, not in the app bundle. `deepmerge` has no fixed version |
| Low | The audit log can keep an invited person's email after their account is deleted | Needed as a record. Review with a lawyer |

## Needs the owner
- Legal review of retention, export and deletion for each market. See D-160 and D-161.
- Copy backups off the server, encrypted. See `docs/DEPLOY.md`.
