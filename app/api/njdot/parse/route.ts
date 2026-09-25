import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const pdf = require('pdf-parse/lib/pdf-parse.js')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Bidder = {
  rank: number
  name: string
  total_bid: number
  percent_of_low_bid: number
  is_low_bidder: boolean
}

type ItemPrice = {
  bidder_rank: number
  unit_price: number
  extended_amount: number
}

type BidItem = {
  line_number: string
  item_number: string
  description: string
  quantity: number
  unit: string
  section_number: string | null
  section_description: string | null
  engineer_estimate_unit_price: number | null
  prices: ItemPrice[]
}

type ParsedContract = {
  contract_number: string
  project_name: string
  letting_date: string
  call_order: string | null
  district: string | null
  contract_time: string | null
  counties: string[]
  bidders: Bidder[]
  items: BidItem[]
}

function moneyToNumber(value: string) {
  return Number(
    value
      .replace(/\$/g, '')
      .replace(/,/g, '')
      .trim()
  )
}

function numberToValue(value: string) {
  return Number(
    value
      .replace(/,/g, '')
      .trim()
  )
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeName(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
}

function monthNumber(month: string) {
  const months: Record<string, string> = {
    january: '01',
    february: '02',
    march: '03',
    april: '04',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    september: '09',
    october: '10',
    november: '11',
    december: '12',
  }

  return months[month.toLowerCase()] || ''
}

function convertDate(
  month: string,
  day: string,
  year: string
) {
  const monthValue = monthNumber(month)

  if (!monthValue) {
    throw new Error(
      `Unrecognized month: ${month}`
    )
  }

  return `${year}-${monthValue}-${day.padStart(2, '0')}`
}

function parseContractMetadata(
  text: string
) {
  const contractMatch =
    text.match(
      /Contract ID:\s*\n?\s*(\d+)/i
    )

  const descriptionMatch =
    text.match(
      /Contract Description:\s*([^\n]+)/i
    )

  const lettingMatch =
    text.match(
      /Letting Date:\s*([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i
    )

  const districtMatch =
    text.match(
      /District\(s\):\s*([A-Za-z0-9-]+)/i
    )

  const callOrderMatch =
    text.match(
      /Call Order:\s*(\d+)/i
    )

  const contractTimeMatch =
    text.match(
      /Contract Time:\s*([^\n]+?)(?=Min:|Max:|\n)/i
    )

  if (!contractMatch) {
    throw new Error(
      'Could not identify Contract ID.'
    )
  }

  if (!descriptionMatch) {
    throw new Error(
      'Could not identify Contract Description.'
    )
  }

  if (!lettingMatch) {
    throw new Error(
      'Could not identify Letting Date.'
    )
  }

  return {
    contract_number:
      contractMatch[1].trim(),

    project_name:
      descriptionMatch[1].trim(),

    letting_date:
      convertDate(
        lettingMatch[1],
        lettingMatch[2],
        lettingMatch[3]
      ),

    call_order:
      callOrderMatch?.[1]?.trim() ||
      null,

    district:
      districtMatch?.[1]?.trim() ||
      null,

    contract_time:
      contractTimeMatch?.[1]?.trim() ||
      null,
  }
}

function parseCounties(text: string) {
  const match =
    text.match(
      /Counties:\s*([\s\S]*?)(?=Letting Date:)/i
    )

  if (!match) {
    return []
  }

  return match[1]
    .replace(/\n/g, ' ')
    .split(',')
    .map(value =>
      value
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase()
    )
    .filter(Boolean)
}

function parseBidders(
  lines: string[]
): Bidder[] {
  const startIndex =
    lines.findIndex(line =>
      line.includes(
        'Total BidRankVendor Name'
      )
    )

  if (startIndex === -1) {
    throw new Error(
      'Vendor Ranking table was not found.'
    )
  }

  const bidderLines =
    lines.slice(startIndex + 1)

  const bidders: Bidder[] = []

  let index = 0

  while (index < bidderLines.length) {
    const rankLine =
      bidderLines[index]

    if (
      !/^\d+$/.test(rankLine)
    ) {
      index++
      continue
    }

    const rank =
      Number(rankLine)

    const name =
      bidderLines[index + 1]

    const totalBid =
      bidderLines[index + 2]

    const percent =
      bidderLines[index + 3]

    if (
      !name ||
      !totalBid ||
      !percent ||
      !/^\$[\d,]+\.\d{2}$/.test(
        totalBid
      ) ||
      !/^\d+(?:\.\d+)?%$/.test(
        percent
      )
    ) {
      index++
      continue
    }

    bidders.push({
      rank,
      name:
        normalizeName(name),

      total_bid:
        moneyToNumber(totalBid),

      percent_of_low_bid:
        Number(
          percent.replace('%', '')
        ),

      is_low_bidder:
        rank === 1,
    })

    index += 4
  }

  if (bidders.length === 0) {
    throw new Error(
      'No bidders could be parsed from Vendor Ranking.'
    )
  }

  return bidders
}

function parseBidPriceString(
  value: string,
  bidderCount: number
): ItemPrice[] {
  /*
    NJDOT concatenates each bidder's unit price
    directly to the extended amount:

    0.843301,149,954.54
    0.970001,322,727.27
    1.040001,418,181.81

    Unit prices in this format have 5 decimal places.
    Extended amounts have commas and 2 decimal places.
  */

 const pairRegex =
  /(\d+\.\d{5})((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})/g

  const matches =
    Array.from(
      value.matchAll(pairRegex)
    )

  if (matches.length !== bidderCount) {
    throw new Error(
      `Expected ${bidderCount} bidder price pairs but found ${matches.length}: ${value}`
    )
  }

  return matches.map(
    (match, index) => ({
      bidder_rank: index + 1,

      unit_price:
        Number(match[1]),

      extended_amount:
        moneyToNumber(match[2]),
    })
  )
}

function parseItems(
  lines: string[],
  bidders: Bidder[]
): BidItem[] {
  const firstSectionIndex =
  lines.findIndex(line =>
    /^\d{4}.*SECTION:/i.test(line)
  )

  const totalsIndex =
    lines.findIndex(
      (line, index) =>
        index > firstSectionIndex &&
        line.startsWith('Section Totals:')
    )

  if (
    firstSectionIndex === -1 ||
    totalsIndex === -1
  ) {
    throw new Error(
      'NJDOT item section could not be identified.'
    )
  }

  const itemLines =
    lines.slice(
      firstSectionIndex,
      totalsIndex
    )

  let sectionNumber: string | null =
    null

  let sectionDescription: string | null =
    null

  const sectionLine =
    itemLines[0]

  const sectionMatch =
    sectionLine.match(
      /^(\d{4})(.*?)SECTION:/i
    )

  if (sectionMatch) {
    sectionNumber =
      sectionMatch[1]

    sectionDescription =
      sectionMatch[2].trim() || null
  }

  const items: BidItem[] = []

  for (
    let i = 1;
    i < itemLines.length;
    i++
  ) {
    const identifierLine =
      itemLines[i]

    const identifierMatch =
  identifierLine.match(
    /^(\d{4})([A-Z]{1,6}\d+[A-Z0-9]*)$/
  )

    if (!identifierMatch) {
      continue
    }

    const lineNumber =
      identifierMatch[1]

    const itemNumber =
      identifierMatch[2]

    /*
      Find the NEXT item. Everything between
      this item number and the next item belongs
      to the current item.

      This is safer than assuming every NJDOT PDF
      uses exactly five lines per item.
    */

    let nextItemIndex =
      itemLines.length

    for (
      let j = i + 1;
      j < itemLines.length;
      j++
    ) {
      if (
  /^(\d{4})([A-Z]{1,6}\d+[A-Z0-9]*)$/.test(
    itemLines[j]
  )
) {
        nextItemIndex = j
        break
      }
    }

    const block =
      itemLines.slice(
        i + 1,
        nextItemIndex
      )

    /*
      Find the quantity.

      Normal NJDOT quantities look like:
      1
      25.000
      1,363,636.360
    */

    const quantityIndex =
  block.findIndex(line =>
    /^[\d,]+(?:\.\d+)?$/.test(line) ||
    /^\(\d+(?:\.\d+)?\)$/.test(line)
  )
   
    if (quantityIndex === -1) {
      throw new Error(
        `Could not identify quantity for ${itemNumber}. Block: ${block.join(' | ')}`
      )
    }

    if (quantityIndex === 0) {
      throw new Error(
        `Could not identify description for ${itemNumber}.`
      )
    }

    const description =
      block
        .slice(0, quantityIndex)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

    const quantityLine =
      block[quantityIndex]

    const unit =
      block[quantityIndex + 1]

    if (!unit) {
      throw new Error(
        `Could not identify unit for ${itemNumber}.`
      )
    }

    /*
      Find the bidder-price line AFTER the unit.
      Rather than assuming it is immediately next,
      test each following line against our known
      NJDOT bidder-price format.
    */

    let priceLine: string | null =
      null

    for (
      let j = quantityIndex + 2;
      j < block.length;
      j++
    ) {
      const candidate =
        block[j]

      const pairRegex =
  /(\d+\.\d{5})((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})/g

      const matches =
        Array.from(
          candidate.matchAll(pairRegex)
        )

      if (
        matches.length === bidders.length
      ) {
        priceLine = candidate
        break
      }
    }

    if (!priceLine) {
      throw new Error(
        `Could not identify bidder prices for ${itemNumber}. Block: ${block.join(' | ')}`
      )
    }

   const quantity =
  /^\(\d+(?:\.\d+)?\)$/.test(quantityLine)
    ? Number(
        quantityLine
          .replace('(', '')
          .replace(')', '')
      )
    : numberToValue(quantityLine)

    if (
      !Number.isFinite(quantity)
    ) {
      throw new Error(
        `Invalid quantity for ${itemNumber}: ${quantityLine}`
      )
    }

    const prices =
      parseBidPriceString(
        priceLine,
        bidders.length
      )

    items.push({
      line_number:
        lineNumber,

      item_number:
        itemNumber,

      description,

      quantity,

      unit:
        unit.trim(),

      section_number:
        sectionNumber,

      section_description:
        sectionDescription,

      engineer_estimate_unit_price:
        null,

      prices,
    })

    /*
      Skip forward to the next item.
    */

    i =
      nextItemIndex - 1
  }

  if (items.length === 0) {
    throw new Error(
      'No bid items were parsed.'
    )
  }

  return items
}

function validateParsedContract(
  parsed: ParsedContract
) {
  const errors: string[] = []

  if (
    !parsed.contract_number
  ) {
    errors.push(
      'Missing contract number.'
    )
  }

  if (
    parsed.bidders.length === 0
  ) {
    errors.push(
      'No bidders found.'
    )
  }

  if (
    parsed.items.length === 0
  ) {
    errors.push(
      'No items found.'
    )
  }

  for (
    const item of parsed.items
  ) {
    if (
      item.prices.length !==
      parsed.bidders.length
    ) {
      errors.push(
        `${item.item_number}: ${item.prices.length} prices for ${parsed.bidders.length} bidders.`
      )
    }

    for (
      const price of item.prices
    ) {
      const expected =
        item.quantity *
        price.unit_price

      const difference =
        Math.abs(
          expected -
          price.extended_amount
        )

      /*
        Allow small rounding differences.
        Some NJDOT items may use unusual
        unit conventions, so this is
        validation rather than an
        automatic rejection threshold.
      */

      if (
        difference > 1.00
      ) {
        errors.push(
          `${item.item_number} bidder ${price.bidder_rank}: quantity × unit price differs from extension by $${difference.toFixed(2)}.`
        )
      }
    }
  }

  return {
    valid:
      errors.length === 0,

    errors,
  }
}

export async function GET() {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY

    const supabaseProjectRef =
  supabaseUrl
    ?.replace('https://', '')
    .split('.')[0]
    
    if (!supabaseUrl) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL is not configured.'
      )
    }

    if (!serviceRoleKey) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY is not configured.'
      )
    }

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      )

    // ==========================================
    // FIND NJDOT SOURCE
    // ==========================================

    const {
      data: source,
      error: sourceError,
    } = await supabase
      .from(
        'external_data_sources'
      )
      .select('id')
      .eq(
        'abbreviation',
        'NJDOT'
      )
      .single()

    if (
      sourceError ||
      !source
    ) {
      throw new Error(
        `NJDOT source not found: ${
          sourceError?.message ??
          'Unknown error'
        }`
      )
    }

    const {
  data: diagnosticRow,
  error: diagnosticError,
} = await supabase
  .from('external_source_documents')
  .select('id,contract_number,document_type,processing_status,updated_at')
  .eq(
    'id',
    'bd82e45d-3a19-4380-a290-5b8f5dc48f41'
  )
  .single()

if (diagnosticError) {
  throw new Error(
    `Diagnostic lookup failed: ${diagnosticError.message}`
  )
}
    
    // ==========================================
    // SELECT ONE PENDING DOCUMENT
    // ==========================================

const {
  data: documents,
  error: documentError,
} = await supabase
  .from('external_source_documents')
  .select(`
    id,
    contract_number,
    title,
    source_url,
    processing_status,
    created_at
  `)
  .eq('data_source_id', source.id)
  .eq('document_type', 'bid_tabulation')
  .eq('processing_status', 'pending')
  .neq(
    'id',
    'bd82e45d-3a19-4380-a290-5b8f5dc48f41'
  )
  .order('created_at', {
    ascending: true,
  })
  .limit(1)

if (documentError) {
  throw new Error(
    `Could not select NJDOT document: ${documentError.message}`
  )
}

const document =
  documents?.[0] ?? null

if (!document) {
  return NextResponse.json({
    success: true,
    message:
      'No pending NJDOT bid tabulations were found.',
  })
}

    // ==========================================
    // STORAGE PATH
    // ==========================================

    const safeContract =
      String(
        document.contract_number ||
        document.id
      )
        .replace(
          /[^a-zA-Z0-9_-]/g,
          '_'
        )
        .slice(0, 100)

    const storagePath =
      `2026/${safeContract}/${document.id}.pdf`

    // ==========================================
    // GET PDF
    // ==========================================

    let pdfBuffer: Buffer

    let sourceUsed =
      'Supabase Storage'

    const {
      data: storedFile,
      error: storageError,
    } =
      await supabase.storage
        .from(
          'njdot-source-documents'
        )
        .download(
          storagePath
        )

    if (
      !storageError &&
      storedFile
    ) {
      pdfBuffer =
        Buffer.from(
          await storedFile.arrayBuffer()
        )
    } else {
      sourceUsed =
        'NJDOT source URL'

      const response =
        await fetch(
          document.source_url,
          {
            headers: {
              'User-Agent':
                'CivilBid/1.0 NJDOT public-data parser',

              Accept:
                'application/pdf,*/*',
            },

            cache:
              'no-store',
          }
        )

      if (!response.ok) {
        throw new Error(
          `NJDOT returned HTTP ${response.status}`
        )
      }

      pdfBuffer =
        Buffer.from(
          await response.arrayBuffer()
        )
    }

    // ==========================================
    // VERIFY PDF
    // ==========================================

    const signature =
      pdfBuffer
        .subarray(0, 5)
        .toString('ascii')

    if (
      signature !== '%PDF-'
    ) {
      throw new Error(
        `Invalid PDF signature: ${signature}`
      )
    }

    // ==========================================
    // EXTRACT TEXT
    // ==========================================

    const pdfResult =
      await pdf(pdfBuffer)

    const normalizedText =
      normalizeText(
        String(
          pdfResult.text || ''
        )
      )

    if (
      !normalizedText
    ) {
      throw new Error(
        'PDF contains no extractable text.'
      )
    }

    const lines =
      normalizedText
        .split('\n')
        .map(line =>
          line.trim()
        )
        .filter(Boolean)

    // ==========================================
    // PARSE STRUCTURE
    // ==========================================

    const metadata =
      parseContractMetadata(
        normalizedText
      )

    const counties =
      parseCounties(
        normalizedText
      )

    const bidders =
      parseBidders(
        lines
      )

    const items =
      parseItems(
        lines,
        bidders
      )

    const parsed:
      ParsedContract = {
        ...metadata,
        counties,
        bidders,
        items,
      }

    // ==========================================
    // VALIDATE
    // ==========================================

    const validation =
      validateParsedContract(
        parsed
      )

    // ==========================================
    // RETURN ONLY — NO DB WRITES
    // ==========================================

    return NextResponse.json({
  success: true,

  mode:
    'structured_parse_test',

diagnostics: {
  supabase_project_ref:
    supabaseProjectRef,

  database_row:
    diagnosticRow,
},

      document: {
        id:
          document.id,

        expected_contract_number:
          document.contract_number,

        source_used:
          sourceUsed,

        storage_path:
          storagePath,
      },

      parsed,

      validation,

      pdf: {
        pages:
          pdfResult.numpages,

        bytes:
          pdfBuffer.length,

        extracted_characters:
          normalizedText.length,
      },

      message:
        'Structured NJDOT parsing completed. No database records were changed.',
    })
  } catch (error) {
    console.error(
      'NJDOT structured parser failed:',
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
