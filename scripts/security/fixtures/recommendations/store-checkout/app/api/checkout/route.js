import Stripe from 'stripe';
export async function POST() { return Response.json({ provider: Stripe.name }); }
