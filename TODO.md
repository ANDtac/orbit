# Orbit Cleanup Tasks

## Progress Log
- [ ] Dataclass field order fixes
- [x] Replace deprecated `datetime.utcnow`
- [x] Remove unused imports/variables *(backend auth/utils/tests scopes)*
- [x] Fix incorrect call parameters *(auth routes, device fixture)*
- [x] Repair `__all__` assignment
- [x] Resolve callable/None issue in annotations
- [x] Guard optional attribute access in tests
- [x] Update generator fixture typing
- [x] Frontend TypeScript/Vite configuration

## Notes
- Begin with backend dataclass and datetime adjustments; tackle related constructor kwargs simultaneously to reduce churn.
- Completed first pass for logging/compliance/lifecycle/task models; remaining models still need ordering review.
- Updated device model timestamps to use `utcnow()` helper and aligned frontend Vite config with ESM patterns.
- Ensure TODO is updated after each work session.
