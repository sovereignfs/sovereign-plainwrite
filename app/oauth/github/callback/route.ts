import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      error: 'GitHub OAuth callback is not implemented yet.',
      task: 'PLW-009',
    },
    { status: 501 },
  );
}
