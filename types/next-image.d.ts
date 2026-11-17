// Static image imports (import x from '@/public/….webp') need Next's image
// module declarations. They normally come from the generated, gitignored
// next-env.d.ts, which doesn't exist in CI's type-check job (no build runs
// first), so reference them from a committed file too.
/// <reference types="next/image-types/global" />
