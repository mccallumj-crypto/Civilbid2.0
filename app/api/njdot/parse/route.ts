import {
  NextRequest,
  NextResponse,
} from 'next/server'
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
  bidderCount: number,
  quantity: number
): ItemPrice[] {
  const compact =
    value.replace(/\s+/g, '')

  /*
    NJDOT bidder-price rows are concatenated as:

    UNIT PRICE + EXTENDED AMOUNT

    Unit price:
      5 decimal places

    Extended amount:
      2 decimal places

    Examples:

    20,000.0000020,000.00
    60,000.0000060,000.00

    100.00000100.00
    12,000.0000012,000.00

    0.843301,149,954.54
  */

  const pairRegex =
    /((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{5})((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})/g

  const matches =
    Array.from(
      compact.matchAll(pairRegex)
    )

  if (
    matches.length !==
    bidderCount
  ) {
    throw new Error(
      `Expected ${bidderCount} bidder price pairs but found ${matches.length}: ${value}`
    )
  }

  const prices: ItemPrice[] =
    matches.map(
      (match, index) => {
        const unitPrice =
          moneyToNumber(
            match[1]
          )

        const extendedAmount =
          moneyToNumber(
            match[2]
          )

        return {
          bidder_rank:
            index + 1,

          unit_price:
            unitPrice,

          extended_amount:
            extendedAmount,
        }
      }
    )

  /*
    Arithmetic validation here gives us
    another safeguard against a regex
    accidentally splitting the row wrong.
  */

  for (
    const price of prices
  ) {
    const expected =
      quantity *
      price.unit_price

    const difference =
      Math.abs(
        expected -
        price.extended_amount
      )

    if (difference > 1.00) {
      throw new Error(
        `Price arithmetic failed for bidder ${price.bidder_rank}. ` +
        `Quantity ${quantity} × unit price ${price.unit_price} = ${expected.toFixed(2)}, ` +
        `but NJDOT extension is ${price.extended_amount.toFixed(2)}.`
      )
    }
  }

  return prices
}

function parseItems(
  lines: string[],
  bidders: Bidder[]
): BidItem[] {
  const items: BidItem[] = []

  let currentSectionNumber:
    | string
    | null = null

  let currentSectionDescription:
    | string
    | null = null

  /*
    Scan the WHOLE PDF rather than stopping
    at the first Section Totals.
  */

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i]

    // ------------------------------------------
    // SECTION HEADER
    // Example:
    // 0001RoadwaySECTION:Cat Alt Set:...
    // ------------------------------------------

    const sectionMatch =
      line.match(
        /^(\d{4})(.*?)SECTION:/i
      )

    if (sectionMatch) {
      currentSectionNumber =
        sectionMatch[1]

      currentSectionDescription =
        sectionMatch[2]
          .replace(/\s+/g, ' ')
          .trim() || null

      continue
    }

    // ------------------------------------------
    // ITEM IDENTIFIER
    //
    // Example:
    // 0061152006P
    // 0061MME144M
    // ------------------------------------------

    const identifierMatch =
      line.match(
        /^(\d{4})([A-Z0-9]*[A-Z][A-Z0-9]*)$/
      )

    if (!identifierMatch) {
      continue
    }

    const lineNumber =
      identifierMatch[1]

    const itemNumber =
      identifierMatch[2]

    /*
      Reject obvious non-item strings.
    */

    if (
      itemNumber.length < 3
    ) {
      continue
    }

    // ------------------------------------------
    // BUILD ITEM BLOCK
    // ------------------------------------------

    const block: string[] = []

    let j =
      i + 1

    for (
      ;
      j < lines.length;
      j++
    ) {
      const candidate =
        lines[j]

      if (
        /^(\d{4})([A-Z0-9]*[A-Z][A-Z0-9]*)$/.test(
          candidate
        )
      ) {
        break
      }

      if (
        /^\d{4}.*SECTION:/i.test(
          candidate
        )
      ) {
        break
      }

      if (
        candidate.startsWith(
          'Section Totals:'
        )
      ) {
        break
      }

      /*
        Stop when we've clearly reached
        the metadata/ranking portion.
      */

      if (
        candidate ===
          'Tabulation of Bids' ||
        candidate.startsWith(
          'Vendor Ranking'
        )
      ) {
        break
      }

      block.push(candidate)
    }

    if (block.length < 4) {
      continue
    }

    // ------------------------------------------
    // QUANTITY
    // ------------------------------------------

    const quantityIndex =
      block.findIndex(value =>
        /^[\d,]+(?:\.\d+)?$/.test(
          value
        ) ||
        /^\(\d+(?:\.\d+)?\)$/.test(
          value
        )
      )

    if (quantityIndex <= 0) {
      continue
    }

    const quantityLine =
      block[quantityIndex]

    const quantity =
      /^\(\d+(?:\.\d+)?\)$/.test(
        quantityLine
      )
        ? Number(
            quantityLine
              .replace(/[()]/g, '')
          )
        : numberToValue(
            quantityLine
          )

    if (
      !Number.isFinite(quantity)
    ) {
      continue
    }

    // ------------------------------------------
    // DESCRIPTION
    // ------------------------------------------

    const description =
      block
        .slice(
          0,
          quantityIndex
        )
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

    if (!description) {
      continue
    }

    // ------------------------------------------
    // UNIT
    // ------------------------------------------

    const unit =
      block[
        quantityIndex + 1
      ]

    if (!unit) {
      continue
    }

    // ------------------------------------------
    // FIND PRICE LINE
    // ------------------------------------------

    let parsedPrices:
      | ItemPrice[]
      | null = null

    let priceError:
      | Error
      | null = null

    for (
      let k =
        quantityIndex + 2;
      k < block.length;
      k++
    ) {
      const candidate =
        block[k]

      /*
        Price rows contain decimals.
      */

      if (
        !/\d+\.\d+/.test(
          candidate
        )
      ) {
        continue
      }

      try {
        const result =
          parseBidPriceString(
            candidate,
            bidders.length,
            quantity
          )

        if (
          result.length ===
          bidders.length
        ) {
          parsedPrices =
            result

          break
        }
      } catch (error) {
        priceError =
          error instanceof Error
            ? error
            : new Error(
                String(error)
              )
      }
    }

    if (!parsedPrices) {
      throw new Error(
        `Could not parse prices for ${itemNumber}. ` +
        `Block: ${block.join(' | ')}. ` +
        `Last parser error: ${
          priceError?.message ||
          'none'
        }`
      )
    }

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
        currentSectionNumber,

      section_description:
        currentSectionDescription,

      engineer_estimate_unit_price:
        null,

      prices:
        parsedPrices,
    })

    /*
      Jump to where this item's block ended.
    */

    i =
      j - 1
  }

  if (items.length === 0) {
    throw new Error(
      'No NJDOT bid items were parsed.'
    )
  }

  return items
}

function validateParsedContract(
  parsed: ParsedContract
) {
  const errors: string[] = []

  if (!parsed.contract_number) {
    errors.push(
      'Missing contract number.'
    )
  }

  if (parsed.bidders.length === 0) {
    errors.push(
      'No bidders found.'
    )
  }

  if (parsed.items.length === 0) {
    errors.push(
      'No items found.'
    )
  }

  // ==========================================
  // ITEM-LEVEL VALIDATION
  // ==========================================

  for (const item of parsed.items) {
    if (
      item.prices.length !==
      parsed.bidders.length
    ) {
      errors.push(
        `${item.item_number}: ${item.prices.length} prices for ${parsed.bidders.length} bidders.`
      )

      continue
    }

    for (const price of item.prices) {
      const expected =
        item.quantity *
        price.unit_price

      const difference =
        Math.abs(
          expected -
          price.extended_amount
        )

      if (difference > 1.00) {
        errors.push(
          `${item.item_number} bidder ${price.bidder_rank}: ` +
          `quantity × unit price differs from extension by ` +
          `$${difference.toFixed(2)}.`
        )
      }
    }
  }

  // ==========================================
  // CONTRACT-TOTAL VALIDATION
  // ==========================================

  const bidderTotals =
    parsed.bidders.map(bidder => {
      const calculatedTotal =
        parsed.items.reduce(
          (sum, item) => {
            const price =
              item.prices.find(
                p =>
                  p.bidder_rank ===
                  bidder.rank
              )

            return (
              sum +
              (price?.extended_amount ?? 0)
            )
          },
          0
        )

      const difference =
        Math.abs(
          calculatedTotal -
          bidder.total_bid
        )

      const matches =
        difference <= 1.00

      if (!matches) {
        errors.push(
          `Bidder ${bidder.rank} (${bidder.name}): ` +
          `item extensions total $${calculatedTotal.toFixed(2)}, ` +
          `but official bid total is $${bidder.total_bid.toFixed(2)} ` +
          `(difference $${difference.toFixed(2)}).`
        )
      }

      return {
        bidder_rank:
          bidder.rank,

        bidder_name:
          bidder.name,

        calculated_item_total:
          Number(
            calculatedTotal.toFixed(2)
          ),

        official_bid_total:
          bidder.total_bid,

        difference:
          Number(
            difference.toFixed(2)
          ),

        matches,
      }
    })

  return {
    valid:
      errors.length === 0,

    errors,

    bidder_totals:
      bidderTotals,
  }
}

async function importValidatedContract(
  supabase: any,
  source: any,
  document: any,
  parsed: ParsedContract,
  validation: any
) {
  // ==========================================
  // SAFETY GATE
  // ==========================================

  if (!validation.valid) {
    throw new Error(
      'Import blocked because contract validation failed.'
    )
  }



  // ==========================================
  // CONTRACT
  // ==========================================

  const {
    data: contract,
    error: contractError,
  } = await supabase
    .from('bid_contracts')
    .upsert(
      {
        source_id:
          source.id,

        source_document_id:
          document.id,

        contract_number:
          parsed.contract_number,

        project_name:
          parsed.project_name,

        letting_date:
          parsed.letting_date,

        call_order:
          parsed.call_order,

        district:
          parsed.district,

        contract_time:
          parsed.contract_time,

        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          'source_id,contract_number',
      }
    )
    .select('id')
    .single()

  if (contractError) {
    throw new Error(
      `Contract import failed: ${contractError.message}`
    )
  }

  const contractId =
    contract.id

  // ==========================================
  // COUNTIES
  // ==========================================

  if (parsed.counties.length > 0) {
    const countyRows =
      parsed.counties.map(
        county => ({
          contract_id:
            contractId,

          county,
        })
      )

    const {
      error: countyError,
    } = await supabase
      .from(
        'bid_contract_counties'
      )
      .upsert(
        countyRows,
        {
          onConflict:
            'contract_id,county',

          ignoreDuplicates:
            true,
        }
      )

    if (countyError) {
      throw new Error(
        `County import failed: ${countyError.message}`
      )
    }
  }

  // ==========================================
  // BIDDERS
  // ==========================================

  const bidderRows =
    parsed.bidders.map(
      bidder => ({
        contract_id:
          contractId,

        bidder_name:
          bidder.name,

        bidder_rank:
          bidder.rank,

        total_bid:
          bidder.total_bid,

        percent_of_low_bid:
          bidder.percent_of_low_bid,

        is_low_bidder:
          bidder.is_low_bidder,

        updated_at:
          new Date().toISOString(),
      })
    )

  const {
    data: importedBidders,
    error: bidderError,
  } = await supabase
    .from(
      'bid_contract_bidders'
    )
    .upsert(
      bidderRows,
      {
        onConflict:
          'contract_id,bidder_name',
      }
    )
    .select(
      'id,bidder_name,bidder_rank'
    )

  if (bidderError) {
    throw new Error(
      `Bidder import failed: ${bidderError.message}`
    )
  }

  if (
    !importedBidders ||
    importedBidders.length !==
      parsed.bidders.length
  ) {
    throw new Error(
      'Bidder import returned an unexpected number of records.'
    )
  }

  const bidderIdByRank =
    new Map<number, string>()

  for (
    const bidder of
      importedBidders
  ) {
    bidderIdByRank.set(
      bidder.bidder_rank,
      bidder.id
    )
  }

  // ==========================================
  // ITEMS
  // ==========================================

  const itemRows =
    parsed.items.map(
      item => ({
        contract_id:
          contractId,

        line_number:
          item.line_number,

        item_number:
          item.item_number,

        description:
          item.description,

        quantity:
          item.quantity,

        unit:
          item.unit,

        section_number:
          item.section_number,

        section_description:
          item.section_description,

        engineer_estimate_unit_price:
          item.engineer_estimate_unit_price,

        updated_at:
          new Date().toISOString(),
      })
    )

  const {
    data: importedItems,
    error: itemError,
  } = await supabase
    .from(
      'bid_contract_items'
    )
    .upsert(
      itemRows,
      {
        onConflict:
          'contract_id,item_number,line_number',
      }
    )
    .select(
      'id,line_number,item_number'
    )

  if (itemError) {
    throw new Error(
      `Item import failed: ${itemError.message}`
    )
  }

  if (
    !importedItems ||
    importedItems.length !==
      parsed.items.length
  ) {
    throw new Error(
      `Item import returned ${
        importedItems?.length ?? 0
      } records; expected ${
        parsed.items.length
      }.`
    )
  }

  const itemIdMap =
    new Map<string, string>()

  for (
    const item of importedItems
  ) {
    const key =
      `${item.line_number}::${item.item_number}`

    itemIdMap.set(
      key,
      item.id
    )
  }

  // ==========================================
  // BID ITEM PRICES
  // ==========================================

  const priceRows: any[] =
    []

  for (
    const item of parsed.items
  ) {
    const itemKey =
      `${item.line_number}::${item.item_number}`

    const contractItemId =
      itemIdMap.get(
        itemKey
      )

    if (!contractItemId) {
      throw new Error(
        `Could not find imported item ID for ${item.line_number}/${item.item_number}.`
      )
    }

    for (
      const price of item.prices
    ) {
      const bidderId =
        bidderIdByRank.get(
          price.bidder_rank
        )

      if (!bidderId) {
        throw new Error(
          `Could not find bidder ID for rank ${price.bidder_rank}.`
        )
      }

      priceRows.push({
        contract_item_id:
          contractItemId,

        bidder_id:
          bidderId,

        unit_price:
          price.unit_price,

        extended_amount:
          price.extended_amount,
      })
    }
  }

  const {
    data: importedPrices,
    error: priceError,
  } = await supabase
    .from(
      'bid_item_prices'
    )
    .upsert(
      priceRows,
      {
        onConflict:
          'contract_item_id,bidder_id',
      }
    )
    .select('id')

  if (priceError) {
    throw new Error(
      `Bid item price import failed: ${priceError.message}`
    )
  }

  const expectedPriceCount =
    parsed.items.length *
    parsed.bidders.length

  if (
    !importedPrices ||
    importedPrices.length !==
      expectedPriceCount
  ) {
    throw new Error(
      `Price import returned ${
        importedPrices?.length ?? 0
      } records; expected ${expectedPriceCount}.`
    )
  }

   // ==========================================
  // MARK SOURCE DOCUMENT PROCESSED
  // ==========================================

  const processedAt =
    new Date().toISOString()

  const {
    error: processedError,
  } = await supabase
    .from(
      'external_source_documents'
    )
    .update({
      processing_status:
        'processed',

      processed_at:
        processedAt,

      error_message:
        null,

      updated_at:
        processedAt,
    })
    .eq(
      'id',
      document.id
    )

  if (processedError) {
    throw new Error(
      `Could not mark source document processed: ${processedError.message}`
    )
  }

  // ==========================================
  // RESULT
  // ==========================================

  return {
    contract_id:
      contractId,

    contract_number:
      parsed.contract_number,

    counties_imported:
      parsed.counties.length,

    bidders_imported:
      importedBidders.length,

    items_imported:
      importedItems.length,

    prices_imported:
      importedPrices.length,

    source_document_status:
      'processed',
  }
}

async function processOneDocument(
  supabase: any,
  source: any,
  document: any
) {
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
  // VERIFY CONTRACT NUMBER
  // ==========================================

  if (
    document.contract_number &&
    parsed.contract_number !==
      document.contract_number
  ) {
    throw new Error(
      `Contract number mismatch. Expected ${document.contract_number}, parsed ${parsed.contract_number}.`
    )
  }

  // ==========================================
  // VALIDATE
  // ==========================================

  const validation =
    validateParsedContract(
      parsed
    )

  if (!validation.valid) {
    throw new Error(
      `Contract validation failed: ${validation.errors.join(' | ')}`
    )
  }

  // ==========================================
  // IMPORT
  // ==========================================

  const importResult =
    await importValidatedContract(
      supabase,
      source,
      document,
      parsed,
      validation
    )

  return {
    import:
      importResult,

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
  }
}

export async function GET(
  request: NextRequest
) {
    const requestedBatchSize =
    Number(
      request.nextUrl.searchParams.get(
        'batch'
      ) ?? '1'
    )

  const batchSize =
    Number.isFinite(
      requestedBatchSize
    )
      ? Math.min(
          Math.max(
            Math.floor(
              requestedBatchSize
            ),
            1
          ),
          5
        )
      : 1
  
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

      global: {
        fetch: (
          input,
          init = {}
        ) => {
          return fetch(
            input,
            {
              ...init,

              cache: 'no-store',

              headers: {
                ...Object.fromEntries(
                  new Headers(
                    init.headers
                  ).entries()
                ),

                'Cache-Control':
                  'no-cache, no-store, max-age=0',

                Pragma:
                  'no-cache',
              },
            }
          )
        },
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
    
    // ==========================================
         // ==========================================
    // SELECT VERIFIED PENDING DOCUMENTS
    // ==========================================

    const {
      data: pendingCandidates,
      error: candidateError,
    } = await supabase
      .from(
        'external_source_documents'
      )
      .select(`
        id,
        contract_number,
        title,
        source_url,
        processing_status,
        created_at
      `)
      .eq(
        'data_source_id',
        source.id
      )
      .eq(
        'document_type',
        'bid_tabulation'
      )
      .eq(
        'processing_status',
        'pending'
      )
      .order(
        'created_at',
        {
          ascending: true,
        }
      )
      .limit(25)

    if (candidateError) {
      throw new Error(
        `Could not select NJDOT document candidates: ${candidateError.message}`
      )
    }

    // ==========================================
    // VERIFY CANDIDATES BY EXACT ID
    // ==========================================

    const verifiedDocuments:
      any[] = []

    const candidateDiagnostics:
      any[] = []

    for (
      const candidate of
        pendingCandidates ?? []
    ) {
      const {
        data: currentDocument,
        error: currentDocumentError,
      } = await supabase
        .from(
          'external_source_documents'
        )
        .select(`
          id,
          contract_number,
          title,
          source_url,
          processing_status,
          created_at
        `)
        .eq(
          'id',
          candidate.id
        )
        .single()

      if (currentDocumentError) {
        throw new Error(
          `Could not verify NJDOT document ${candidate.id}: ${currentDocumentError.message}`
        )
      }

      candidateDiagnostics.push({
        id:
          candidate.id,

        contract_number:
          candidate.contract_number,

        filtered_query_status:
          candidate.processing_status,

        exact_read_status:
          currentDocument.processing_status,
      })

      if (
        currentDocument.processing_status ===
        'pending'
      ) {
        verifiedDocuments.push(
          currentDocument
        )
      }

      if (
        verifiedDocuments.length >=
        batchSize
      ) {
        break
      }
    }

    // ==========================================
    // NOTHING LEFT TO PROCESS
    // ==========================================

    if (
      verifiedDocuments.length === 0
    ) {
      return NextResponse.json({
        success: true,

        mode:
          'no_verified_pending_document',

        batch_size:
          batchSize,

        candidates_checked:
          candidateDiagnostics,

        message:
          'No verified pending NJDOT bid tabulations were found.',
      })
    }

    // ==========================================
    // DIAGNOSTIC MODE — NO WRITES
    // ==========================================

    if (
      request.nextUrl.searchParams.get(
        'diagnostic'
      ) === '1'
    ) {
      return NextResponse.json({
        success: true,

        mode:
          'verified_pending_batch_selection',

        supabase_project_ref:
          supabaseProjectRef,

        batch_size:
          batchSize,

        verified_documents:
          verifiedDocuments.map(
            document => ({
              id:
                document.id,

              contract_number:
                document.contract_number,

              processing_status:
                document.processing_status,

              created_at:
                document.created_at,
            })
          ),

        candidates_checked:
          candidateDiagnostics,

        message:
          'Diagnostic only. Verified pending documents were selected. No documents were parsed, imported, or updated.',
      })
    }

    // ==========================================
    // PROCESS VERIFIED DOCUMENTS
    // ==========================================

    const results:
      any[] = []

    for (
      const document of
        verifiedDocuments
    ) {
      try {
        console.info(
          'Processing NJDOT contract:',
          document.contract_number
        )

        const result =
          await processOneDocument(
            supabase,
            source,
            document
          )

        results.push({
          contract_number:
            document.contract_number,

          document_id:
            document.id,

          status:
            'processed',

          import:
            result.import,

          validation:
            result.validation,

          pdf:
            result.pdf,

          source_used:
            result.document.source_used,

          storage_path:
            result.document.storage_path,
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : String(error)

        console.error(
          `NJDOT contract ${document.contract_number} failed:`,
          error
        )

        // ======================================
        // RECORD FAILURE ON SOURCE DOCUMENT
        // ======================================

        const failedAt =
          new Date().toISOString()

        const {
          error: failureUpdateError,
        } = await supabase
          .from(
            'external_source_documents'
          )
          .update({
            processing_status:
              'error',

            error_message:
              errorMessage,

            updated_at:
              failedAt,
          })
          .eq(
            'id',
            document.id
          )

        if (failureUpdateError) {
          console.error(
            'Could not record document failure:',
            failureUpdateError
          )
        }

        results.push({
          contract_number:
            document.contract_number,

          document_id:
            document.id,

          status:
            'failed',

          error:
            errorMessage,
        })

        // Initial batch processor deliberately
        // stops on the first failure.
        break
      }
    }

    // ==========================================
    // BATCH SUMMARY
    // ==========================================

    const processedCount =
      results.filter(
        result =>
          result.status ===
          'processed'
      ).length

    const failedCount =
      results.filter(
        result =>
          result.status ===
          'failed'
      ).length

    return NextResponse.json({
      success:
        failedCount === 0,

      mode:
        'controlled_batch_import',

      supabase_project_ref:
        supabaseProjectRef,

      requested_batch_size:
        batchSize,

      processed:
        processedCount,

      failed:
        failedCount,

      results,

      message:
        failedCount === 0
          ? `Successfully processed ${processedCount} NJDOT contract(s).`
          : `Processed ${processedCount} NJDOT contract(s) before encountering a failure.`,
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
