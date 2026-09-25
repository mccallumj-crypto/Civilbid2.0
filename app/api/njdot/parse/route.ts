import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// pdf-parse 1.x does not ship useful TypeScript definitions.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require('pdf-parse')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL is not configured.'
      )
    }

    if (!serviceRoleKey) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel.'
      )
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    // --------------------------------------------------
    // 1. Find NJDOT source
    // --------------------------------------------------

    const {
      data: source,
      error: sourceError,
    } = await supabase
      .from('external_data_sources')
      .select('id')
      .eq('abbreviation', 'NJDOT')
      .single()

    if (sourceError || !source) {
      throw new Error(
        `NJDOT source not found: ${
          sourceError?.message ?? 'Unknown error'
        }`
      )
    }

    // --------------------------------------------------
    // 2. Select ONE pending NJDOT document
    // --------------------------------------------------

    const {
      data: document,
      error: documentError,
    } = await supabase
      .from('external_source_documents')
      .select(`
        id,
        contract_number,
        title,
        source_url,
        processing_status
      `)
      .eq('data_source_id', source.id)
      .eq('document_type', 'bid_tabulation')
      .eq('processing_status', 'pending')
      .order('created_at', {
        ascending: true,
      })
      .limit(1)
      .maybeSingle()

    if (documentError) {
      throw new Error(
        `Could not select NJDOT document: ${documentError.message}`
      )
    }

    if (!document) {
      return NextResponse.json({
        success: true,
        message:
          'No pending NJDOT bid tabulations were found.',
      })
    }

    // --------------------------------------------------
    // 3. Reconstruct the storage path
    // --------------------------------------------------

    const rawContract =
      document.contract_number ||
      document.id

    const safeContract =
      String(rawContract)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 100)

    const storagePath =
      `2026/${safeContract}/${document.id}.pdf`

    // --------------------------------------------------
    // 4. Try private Storage first
    // --------------------------------------------------

    let pdfBuffer: Buffer
    let sourceUsed = 'Supabase Storage'

    const {
      data: storedFile,
      error: storageError,
    } = await supabase.storage
      .from('njdot-source-documents')
      .download(storagePath)

    if (!storageError && storedFile) {
      pdfBuffer = Buffer.from(
        await storedFile.arrayBuffer()
      )
    } else {
      // ----------------------------------------------
      // Fallback to the original NJDOT URL.
      // This allows us to test documents that have
      // not been archived yet.
      // ----------------------------------------------

      sourceUsed = 'NJDOT source URL'

      const response = await fetch(
        document.source_url,
        {
          headers: {
            'User-Agent':
              'CivilBid/1.0 NJDOT public-data parser',
            Accept: 'application/pdf,*/*',
          },
          cache: 'no-store',
        }
      )

      if (!response.ok) {
        throw new Error(
          `Could not download PDF. NJDOT returned HTTP ${response.status}. Storage error: ${
            storageError?.message ?? 'unknown'
          }`
        )
      }

      pdfBuffer = Buffer.from(
        await response.arrayBuffer()
      )
    }

    // --------------------------------------------------
    // 5. Verify PDF
    // --------------------------------------------------

    const signature =
      pdfBuffer
        .subarray(0, 5)
        .toString('ascii')

    if (signature !== '%PDF-') {
      throw new Error(
        `Downloaded file is not a valid PDF. Signature: ${signature}`
      )
    }

    // --------------------------------------------------
    // 6. Extract text
    // --------------------------------------------------

    const parsed = await pdf(pdfBuffer)

    const rawText =
      String(parsed.text || '')

    if (!rawText.trim()) {
      throw new Error(
        'PDF was valid but pdf-parse returned no text.'
      )
    }

    const normalizedText =
      rawText
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    const lines =
      normalizedText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)

    // --------------------------------------------------
    // 7. Return diagnostics only
    // --------------------------------------------------

    return NextResponse.json({
      success: true,

      mode: 'pdf_text_test',

      document: {
        id: document.id,
        contract_number:
          document.contract_number,
        title: document.title,
        storage_path: storagePath,
        source_used: sourceUsed,
      },

      pdf: {
        bytes: pdfBuffer.length,
        pages: parsed.numpages,
        characters: normalizedText.length,
        lines: lines.length,
      },

      extraction: {
        first_100_lines:
          lines.slice(0, 100),

        preview:
          normalizedText.slice(0, 12000),
      },

      message:
        'PDF text extraction succeeded. No CivilBid bid data was changed.',
    })
  } catch (error) {
    console.error(
      'NJDOT parser test failed:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    )
  }
}
