import { parseBody } from 'next-sanity/webhook';
export async function POST(request) { return parseBody(request); }
