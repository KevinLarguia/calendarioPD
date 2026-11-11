import { connection } from 'next/server'
import { emitirToken } from '@/lib/agendador/token'
import { json } from '@/lib/agendador/request'

export async function GET() {
  await connection()
  return json({ token: emitirToken() })
}
