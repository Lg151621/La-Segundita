import { revalidateTag } from 'next/cache';
import { type NextRequest, NextResponse } from 'next/server';
import { parseBody } from 'next-sanity/webhook';
import { sanityCacheTag } from '@/sanity/env';

// Sanity calls this whenever content is published, unpublished, or deleted, so the live site updates on the next request.
// Configure the webhook in sanity.io/manage with the same secret as SANITY_REVALIDATE_SECRET (server-only, never NEXT_PUBLIC_).
export async function POST(req: NextRequest) {
  const secret = process.env.SANITY_REVALIDATE_SECRET;
  if (!secret) return NextResponse.json({ message: 'SANITY_REVALIDATE_SECRET is not set' }, { status: 500 });
  try {
    // `true` waits until the published change is readable from Sanity before we invalidate.
    const { isValidSignature, body } = await parseBody<{ _type?: string }>(req, secret, true);
    if (!isValidSignature) return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
    // Only Sanity-backed data carries this tag. `expire: 0` means the very next request renders fresh content
    // instead of serving the old page once more.
    revalidateTag(sanityCacheTag, { expire: 0 });
    return NextResponse.json({ revalidated: true, tag: sanityCacheTag, type: body?._type ?? null, now: Date.now() });
  } catch (error) {
    console.error('[sanity] revalidate webhook failed:', error);
    return NextResponse.json({ message: 'Could not read the webhook body' }, { status: 400 });
  }
}
