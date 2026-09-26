import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createClient,
} from '@supabase/supabase-js'

export const runtime =
  'nodejs'

export const dynamic =
  'force-dynamic'

export const maxDuration =
  60

// ==========================================
// TYPES
// ==========================================

type HistoryRow = {
  contract_item_id: string

  item_number: string
  description: string
  quantity: number
  unit: string

  unit_price: number
  extended_amount: number

  contract_number: string
  project_name: string | null
  letting_date: string | null
  district: string | null
  counties: string[]

  bidder_name: string
  bidder_rank: number
  is_low_bidder: boolean
  bidder_total: number
}

// ==========================================
// BASIC HELPERS
// ==========================================

function toNumber(
  value: unknown
) {
  const result =
    Number(value)

  return Number.isFinite(result)
    ? result
    : 0
}

function optionalNumber(
  value: string | null
) {
  if (
    value === null ||
    value.trim() === ''
  ) {
    return null
  }

  const result =
    Number(value)

  return Number.isFinite(result)
    ? result
    : null
}

function round(
  value: number | null,
  decimals = 4
) {
  if (value === null) {
    return null
  }

  const multiplier =
    10 ** decimals

  return (
    Math.round(
      value *
        multiplier
    ) /
    multiplier
  )
}

function booleanParam(
  value: string | null
) {
  if (!value) {
    return false
  }

  const normalized =
    value
      .trim()
      .toLowerCase()

  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes'
  )
}

// ==========================================
// STATISTICS
// ==========================================

function percentile(
  values: number[],
  percentileValue: number
) {
  if (
    values.length === 0
  ) {
    return null
  }

  const sorted =
    [...values].sort(
      (a, b) =>
        a - b
    )

  if (
    sorted.length === 1
  ) {
    return sorted[0]
  }

  const index =
    (
      sorted.length -
      1
    ) *
    percentileValue

  const lower =
    Math.floor(index)

  const upper =
    Math.ceil(index)

  if (
    lower === upper
  ) {
    return sorted[lower]
  }

  const weight =
    index -
    lower

  return (
    sorted[lower] *
      (1 - weight) +
    sorted[upper] *
      weight
  )
}

function median(
  values: number[]
) {
  return percentile(
    values,
    0.5
  )
}

function average(
  values: number[]
) {
  if (
    values.length === 0
  ) {
    return null
  }

  return (
    values.reduce(
      (
        sum,
        value
      ) =>
        sum +
        value,
      0
    ) /
    values.length
  )
}

// ==========================================
// SUMMARY
// ==========================================

function summarizeRows(
  rows: HistoryRow[]
) {
  const unitPrices =
    rows
      .map(
        row =>
          row.unit_price
      )
      .filter(
        value =>
          Number.isFinite(
            value
          ) &&
          value >= 0
      )

  const extendedAmounts =
    rows
      .map(
        row =>
          row.extended_amount
      )
      .filter(
        value =>
          Number.isFinite(
            value
          ) &&
          value >= 0
      )

  const lowBidRows =
    rows.filter(
      row =>
        row.is_low_bidder
    )

  const lowBidPrices =
    lowBidRows
      .map(
        row =>
          row.unit_price
      )
      .filter(
        value =>
          Number.isFinite(
            value
          ) &&
          value >= 0
      )

  const quantities =
    rows
      .map(
        row =>
          row.quantity
      )
      .filter(
        value =>
          Number.isFinite(
            value
          ) &&
          value >= 0
      )

  const contracts =
    new Set(
      rows.map(
        row =>
          row.contract_number
      )
    )

  const bidders =
    new Set(
      rows.map(
        row =>
          row.bidder_name
      )
    )

  const units =
    Array.from(
      new Set(
        rows.map(
          row =>
            row.unit
        )
      )
    )

  /*
    Prefer low-bid observations for the
    suggested historical range when there
    are enough of them.

    Otherwise use all observations.

    The suggested range is the middle
    50% of observations (25th to 75th
    percentile), not an automatic bid
    recommendation.
  */

  const suggestedBasis =
    lowBidPrices.length >=
    3
      ? lowBidPrices
      : unitPrices

  const suggestedBasisName =
    lowBidPrices.length >=
    3
      ? 'low_bid_observations'
      : 'all_bid_observations'

  const positiveQuantities =
    quantities.filter(
      value =>
        value > 0
    )

  const quantityMinimum =
    positiveQuantities.length >
    0
      ? Math.min(
          ...positiveQuantities
        )
      : null

  const quantityMaximum =
    positiveQuantities.length >
    0
      ? Math.max(
          ...positiveQuantities
        )
      : null

  const quantitySpreadRatio =
    quantityMinimum !== null &&
    quantityMaximum !== null &&
    quantityMinimum > 0
      ? quantityMaximum /
        quantityMinimum
      : null

  return {
    contracts:
      contracts.size,

    bidders:
      bidders.size,

    price_observations:
      unitPrices.length,

    low_bid_observations:
      lowBidPrices.length,

    units,

    unit_price: {
      minimum:
        unitPrices.length >
        0
          ? round(
              Math.min(
                ...unitPrices
              )
            )
          : null,

      p25:
        round(
          percentile(
            unitPrices,
            0.25
          )
        ),

      median:
        round(
          median(
            unitPrices
          )
        ),

      average:
        round(
          average(
            unitPrices
          )
        ),

      p75:
        round(
          percentile(
            unitPrices,
            0.75
          )
        ),

      maximum:
        unitPrices.length >
        0
          ? round(
              Math.max(
                ...unitPrices
              )
            )
          : null,
    },

    low_bid_unit_price: {
      minimum:
        lowBidPrices.length >
        0
          ? round(
              Math.min(
                ...lowBidPrices
              )
            )
          : null,

      p25:
        round(
          percentile(
            lowBidPrices,
            0.25
          )
        ),

      median:
        round(
          median(
            lowBidPrices
          )
        ),

      average:
        round(
          average(
            lowBidPrices
          )
        ),

      p75:
        round(
          percentile(
            lowBidPrices,
            0.75
          )
        ),

      maximum:
        lowBidPrices.length >
        0
          ? round(
              Math.max(
                ...lowBidPrices
              )
            )
          : null,
    },

    extended_amount: {
      median:
        round(
          median(
            extendedAmounts
          ),
          2
        ),

      average:
        round(
          average(
            extendedAmounts
          ),
          2
        ),
    },

    quantity: {
      minimum:
        quantityMinimum,

      median:
        round(
          median(
            quantities
          )
        ),

      average:
        round(
          average(
            quantities
          )
        ),

      maximum:
        quantityMaximum,

      spread_ratio:
        quantitySpreadRatio !==
        null
          ? round(
              quantitySpreadRatio,
              2
            )
          : null,

      /*
        A very large quantity spread is a
        warning that raw averages may not
        represent comparable work.
      */

      wide_quantity_range:
        quantitySpreadRatio !==
          null &&
        quantitySpreadRatio >
          10,
    },

    suggested_historical_range:
      suggestedBasis.length >=
      3
        ? {
            low:
              round(
                percentile(
                  suggestedBasis,
                  0.25
                )
              ),

            high:
              round(
                percentile(
                  suggestedBasis,
                  0.75
                )
              ),

            median:
              round(
                median(
                  suggestedBasis
                )
              ),

            basis:
              suggestedBasisName,

            observations:
              suggestedBasis.length,
          }
        : null,
  }
}

// ==========================================
// FETCH ALL MATCHING ROWS
// ==========================================

async function fetchRowsByIds(
  supabase: any,
  table: string,
  columns: string,
  idColumn: string,
  ids: string[]
) {
  if (
    ids.length === 0
  ) {
    return []
  }

  const allRows: any[] =
    []

  /*
    Keep .in() queries reasonably small
    and paginate each chunk so the
    PostgREST row limit does not silently
    truncate large historical searches.
  */

  const idChunkSize =
    100

  const pageSize =
    1000

  for (
    let index = 0;
    index < ids.length;
    index += idChunkSize
  ) {
    const chunk =
      ids.slice(
        index,
        index +
          idChunkSize
      )

    let from =
      0

    while (true) {
      const {
        data,
        error,
      } = await supabase
        .from(table)
        .select(columns)
        .in(
          idColumn,
          chunk
        )
        .range(
          from,
          from +
            pageSize -
            1
        )

      if (error) {
        throw new Error(
          `${table} query failed: ${error.message}`
        )
      }

      const page =
        data ?? []

      allRows.push(
        ...page
      )

      if (
        page.length <
        pageSize
      ) {
        break
      }

      from +=
        pageSize
    }
  }

  return allRows
}

// ==========================================
// ROUTE
// ==========================================

export async function GET(
  request: NextRequest
) {
  try {
    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL

    const serviceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      throw new Error(
        'Supabase environment variables are missing.'
      )
    }

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession:
              false,

            autoRefreshToken:
              false,
          },

          global: {
            fetch: (
              input,
              init = {}
            ) =>
              fetch(
                input,
                {
                  ...init,

                  cache:
                    'no-store',

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
              ),
          },
        }
      )

    const params =
      request.nextUrl
        .searchParams

    const q =
      (
        params.get('q') ??
        ''
      ).trim()

    if (!q) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            'Enter an NJDOT item number or description using ?q=',
        },
        {
          status:
            400,
        }
      )
    }

    // ========================================
    // OPTIONAL FILTERS
    // ========================================

const contractFilter =
  (
    params.get(
      'contract'
    ) ??
    ''
  )
    .trim()
    .toUpperCase()

    const contractFilter =
  (
    params.get(
      'contract'
    ) ??
    ''
  )
    .trim()
    .toUpperCase()
    
    const countyFilter =
      (
        params.get(
          'county'
        ) ??
        ''
      )
        .trim()
        .toUpperCase()

    const districtFilter =
      (
        params.get(
          'district'
        ) ??
        ''
      )
        .trim()
        .toUpperCase()

    const unitFilter =
      (
        params.get(
          'unit'
        ) ??
        ''
      )
        .trim()
        .toUpperCase()

    const bidderFilter =
      (
        params.get(
          'bidder'
        ) ??
        ''
      )
        .trim()
        .toLowerCase()

    const lowBidOnly =
      booleanParam(
        params.get(
          'lowBidOnly'
        )
      )

    const fromDate =
      (
        params.get(
          'from'
        ) ??
        ''
      ).trim()

    const toDate =
      (
        params.get(
          'to'
        ) ??
        ''
      ).trim()

    const quantityTarget =
      optionalNumber(
        params.get(
          'quantity'
        )
      )

    const suppliedQuantityMin =
      optionalNumber(
        params.get(
          'quantityMin'
        )
      )

    const suppliedQuantityMax =
      optionalNumber(
        params.get(
          'quantityMax'
        )
      )

    const suppliedTolerance =
      optionalNumber(
        params.get(
          'quantityTolerance'
        )
      )

    const quantityTolerance =
      suppliedTolerance !==
      null
        ? Math.max(
            0,
            Math.min(
              suppliedTolerance,
              5
            )
          )
        : 0.25

    let quantityMin =
      suppliedQuantityMin

    let quantityMax =
      suppliedQuantityMax

    /*
      If a target quantity is supplied
      without an explicit range, create
      an automatic comparable range.

      Default = +/- 25%.
    */

    if (
      quantityTarget !==
        null &&
      quantityMin === null
    ) {
      quantityMin =
        Math.max(
          0,
          quantityTarget *
            (
              1 -
              quantityTolerance
            )
        )
    }

    if (
      quantityTarget !==
        null &&
      quantityMax === null
    ) {
      quantityMax =
        quantityTarget *
        (
          1 +
          quantityTolerance
        )
    }

    // ========================================
    // FIND HISTORICAL ITEMS
    // ========================================

    const itemColumns = `
      id,
      contract_id,
      line_number,
      item_number,
      description,
      quantity,
      unit,
      section_number,
      section_description,
      engineer_estimate_unit_price
    `

    /*
      Run item-number and description
      searches separately instead of using
      a raw .or() expression.
    */

    const [
      itemNumberResponse,
      descriptionResponse,
    ] =
      await Promise.all([
        supabase
          .from(
            'bid_contract_items'
          )
          .select(
            itemColumns
          )
          .ilike(
            'item_number',
            `%${q}%`
          )
          .limit(
            1000
          ),

        supabase
          .from(
            'bid_contract_items'
          )
          .select(
            itemColumns
          )
          .ilike(
            'description',
            `%${q}%`
          )
          .limit(
            1000
          ),
      ])

    if (
      itemNumberResponse.error
    ) {
      throw new Error(
        `Item number search failed: ${itemNumberResponse.error.message}`
      )
    }

    if (
      descriptionResponse.error
    ) {
      throw new Error(
        `Item description search failed: ${descriptionResponse.error.message}`
      )
    }

    const itemById =
      new Map<
        string,
        any
      >()

    for (
      const item of
      itemNumberResponse.data ??
      []
    ) {
      itemById.set(
        item.id,
        item
      )
    }

    for (
      const item of
      descriptionResponse.data ??
      []
    ) {
      itemById.set(
        item.id,
        item
      )
    }

    const items =
      Array.from(
        itemById.values()
      )

    if (
      items.length === 0
    ) {
      return NextResponse.json({
        success:
          true,

        query:
          q,

        filters: {
          quantity:
            quantityTarget,

          quantity_min:
            quantityMin,

          quantity_max:
            quantityMax,

          quantity_tolerance:
            quantityTolerance,

          county:
            countyFilter ||
            null,

          district:
            districtFilter ||
            null,

          unit:
            unitFilter ||
            null,

          bidder:
            bidderFilter ||
            null,

          low_bid_only:
            lowBidOnly,

          from:
            fromDate ||
            null,

          to:
            toDate ||
            null,
        },

        matching_items:
          0,

        filtered_results:
          0,

        item_groups:
          [],

        results:
          [],
      })
    }

    // ========================================
    // IDS
    // ========================================

    const itemIds =
      items.map(
        item =>
          item.id
      )

    const contractIds =
      Array.from(
        new Set(
          items.map(
            item =>
              item.contract_id
          )
        )
      )

    // ========================================
    // PRICES
    // ========================================

    const prices =
      await fetchRowsByIds(
        supabase,
        'bid_item_prices',
        `
          contract_item_id,
          bidder_id,
          unit_price,
          extended_amount
        `,
        'contract_item_id',
        itemIds
      )

    // ========================================
    // CONTRACTS
    // ========================================

    const contracts =
      await fetchRowsByIds(
        supabase,
        'bid_contracts',
        `
          id,
          contract_number,
          project_name,
          letting_date,
          call_order,
          district,
          contract_time
        `,
        'id',
        contractIds
      )

    // ========================================
    // COUNTIES
    // ========================================

    const counties =
      await fetchRowsByIds(
        supabase,
        'bid_contract_counties',
        `
          contract_id,
          county
        `,
        'contract_id',
        contractIds
      )

    // ========================================
    // BIDDERS
    // ========================================

    const bidderIds =
      Array.from(
        new Set(
          prices.map(
            price =>
              price.bidder_id
          )
        )
      )

    const bidders =
      await fetchRowsByIds(
        supabase,
        'bid_contract_bidders',
        `
          id,
          contract_id,
          bidder_name,
          bidder_rank,
          total_bid,
          percent_of_low_bid,
          is_low_bidder
        `,
        'id',
        bidderIds
      )

    // ========================================
    // LOOKUP MAPS
    // ========================================

    const itemMap =
      new Map(
        items.map(
          item => [
            item.id,
            item,
          ]
        )
      )

    const contractMap =
      new Map(
        contracts.map(
          contract => [
            contract.id,
            contract,
          ]
        )
      )

    const bidderMap =
      new Map(
        bidders.map(
          bidder => [
            bidder.id,
            bidder,
          ]
        )
      )

    const countyMap =
      new Map<
        string,
        string[]
      >()

    for (
      const row of
      counties
    ) {
      const existing =
        countyMap.get(
          row.contract_id
        ) ?? []

      existing.push(
        row.county
      )

      countyMap.set(
        row.contract_id,
        existing
      )
    }

    // ========================================
    // BUILD RAW HISTORY
    // ========================================

    const rawResults:
      HistoryRow[] =
      prices
        .map(
          price => {
            const item =
              itemMap.get(
                price.contract_item_id
              )

            if (!item) {
              return null
            }

            const contract =
              contractMap.get(
                item.contract_id
              )

            const bidder =
              bidderMap.get(
                price.bidder_id
              )

            if (
              !contract ||
              !bidder
            ) {
              return null
            }

            return {
              contract_item_id:
                item.id,

              item_number:
                item.item_number,

              description:
                item.description,

              quantity:
                toNumber(
                  item.quantity
                ),

              unit:
                item.unit,

              unit_price:
                toNumber(
                  price.unit_price
                ),

              extended_amount:
                toNumber(
                  price.extended_amount
                ),

              contract_number:
                contract.contract_number,

              project_name:
                contract.project_name,

              letting_date:
                contract.letting_date,

              district:
                contract.district,

              counties:
                countyMap.get(
                  contract.id
                ) ?? [],

              bidder_name:
                bidder.bidder_name,

              bidder_rank:
                bidder.bidder_rank,

              is_low_bidder:
                Boolean(
                  bidder.is_low_bidder
                ),

              bidder_total:
                toNumber(
                  bidder.total_bid
                ),
            } satisfies HistoryRow
          }
        )
        .filter(
          (
            row
          ): row is HistoryRow =>
            row !== null
        )

    // ========================================
    // APPLY COMPARABILITY FILTERS
    // ========================================

    const results =
      rawResults
        .filter(
          row => {
            if (
  contractFilter &&
  !String(
    row.contract_number ??
    ''
  )
    .toUpperCase()
    .includes(
      contractFilter
    )
) {
  return false
}}
            if (
              quantityMin !==
                null &&
              row.quantity <
                quantityMin
            ) {
              return false
            }

            if (
              quantityMax !==
                null &&
              row.quantity >
                quantityMax
            ) {
              return false
            }

            if (
              countyFilter &&
              !row.counties.some(
                county =>
                  county
                    .toUpperCase() ===
                  countyFilter
              )
            ) {
              return false
            }

            if (
              districtFilter &&
              (
                row.district ??
                ''
              )
                .toUpperCase() !==
                districtFilter
            ) {
              return false
            }

            if (
              unitFilter &&
              (
                row.unit ??
                ''
              )
                .toUpperCase() !==
                unitFilter
            ) {
              return false
            }

            if (
              bidderFilter &&
              !row.bidder_name
                .toLowerCase()
                .includes(
                  bidderFilter
                )
            ) {
              return false
            }

            if (
              lowBidOnly &&
              !row.is_low_bidder
            ) {
              return false
            }

            if (
              fromDate &&
              (
                !row.letting_date ||
                row.letting_date <
                  fromDate
              )
            ) {
              return false
            }

            if (
              toDate &&
              (
                !row.letting_date ||
                row.letting_date >
                  toDate
              )
            ) {
              return false
            }

            return true
          }
        )
        .sort(
          (
            a,
            b
          ) => {
            const dateA =
              a.letting_date
                ? new Date(
                    a.letting_date
                  ).getTime()
                : 0

            const dateB =
              b.letting_date
                ? new Date(
                    b.letting_date
                  ).getTime()
                : 0

            if (
              dateA !==
              dateB
            ) {
              return (
                dateB -
                dateA
              )
            }

            return (
              a.bidder_rank -
              b.bidder_rank
            )
          }
        )

    // ========================================
    // GROUP BY ITEM NUMBER
    // ========================================

    const groupMap =
      new Map<
        string,
        HistoryRow[]
      >()

    for (
      const row of
      results
    ) {
      const existing =
        groupMap.get(
          row.item_number
        ) ?? []

      existing.push(
        row
      )

      groupMap.set(
        row.item_number,
        existing
      )
    }

    const itemGroups =
      Array.from(
        groupMap.entries()
      )
        .map(
          (
            [
              itemNumber,
              groupRows,
            ]
          ) => ({
            item_number:
              itemNumber,

            description:
              groupRows[0]
                ?.description ??
              '',

            units:
              Array.from(
                new Set(
                  groupRows.map(
                    row =>
                      row.unit
                  )
                )
              ),

            summary:
              summarizeRows(
                groupRows
              ),

            results:
              groupRows,
          })
        )
        .sort(
          (a, b) =>
            b.summary
              .price_observations -
            a.summary
              .price_observations
        )

    // ========================================
    // RESPONSE
    // ========================================

    const uniqueItemNumbers =
      Array.from(
        new Set(
          results.map(
            result =>
              result.item_number
          )
        )
      )

    return NextResponse.json({
      success:
        true,

      query:
        q,

      filters: {
        quantity:
          quantityTarget,

        quantity_min:
          quantityMin,

        quantity_max:
          quantityMax,

        quantity_tolerance:
          quantityTolerance,

        county:
          countyFilter ||
          null,

        district:
          districtFilter ||
          null,

        unit:
          unitFilter ||
          null,

        bidder:
          bidderFilter ||
          null,

        low_bid_only:
          lowBidOnly,

        from:
          fromDate ||
          null,

        to:
          toDate ||
          null,
      },

      matching_items:
        items.length,

      matched_item_numbers:
        uniqueItemNumbers,

      filtered_results:
        results.length,

      /*
        Only provide a single top-level
        price summary when the filtered
        data represents one NJDOT item.

        If a description search matches
        several item numbers, use the
        individual item_groups instead of
        mixing unrelated prices.
      */

      summary:
        uniqueItemNumbers.length ===
        1
          ? summarizeRows(
              results
            )
          : null,

      item_groups:
        itemGroups,

      results,
    })
  } catch (error) {
    console.error(
      'Historical pricing API error:',
      error
    )

    return NextResponse.json(
      {
        success:
          false,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status:
          500,
      }
    )
  }
}
