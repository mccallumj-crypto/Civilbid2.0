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
// HELPERS
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

function round(
  value: number | null,
  decimals = 2
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
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
        total,
        value
      ) =>
        total +
        value,
      0
    ) /
    values.length
  )
}

function median(
  values: number[]
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

  const middle =
    Math.floor(
      sorted.length /
        2
    )

  if (
    sorted.length %
      2 ===
    0
  ) {
    return (
      (
        sorted[
          middle - 1
        ] +
        sorted[
          middle
        ]
      ) /
      2
    )
  }

  return sorted[
    middle
  ]
}

async function fetchAllByEq(
  supabase: any,
  table: string,
  columns: string,
  column: string,
  value: string
) {
  const rows: any[] =
    []

  const pageSize =
    1000

  let from =
    0

  while (true) {
    const {
      data,
      error,
    } = await supabase
      .from(table)
      .select(columns)
      .eq(
        column,
        value
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

    rows.push(
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

  return rows
}

async function fetchAllByIds(
  supabase: any,
  table: string,
  columns: string,
  column: string,
  ids: string[]
) {
  if (
    ids.length === 0
  ) {
    return []
  }

  const rows: any[] =
    []

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
          column,
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

      rows.push(
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

  return rows
}

// ==========================================
// ROUTE
// ==========================================

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: {
      contractNumber: string
    }
  }
) {
  try {
    const contractNumber =
      decodeURIComponent(
        params.contractNumber
      )

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

    // ========================================
    // CONTRACT
    // ========================================

    const {
      data:
        contractRows,
      error:
        contractError,
    } = await supabase
      .from(
        'bid_contracts'
      )
      .select(`
        id,
        source_id,
        source_document_id,
        contract_number,
        project_name,
        letting_date,
        call_order,
        district,
        contract_time,
        created_at,
        updated_at
      `)
      .eq(
        'contract_number',
        contractNumber
      )
      .order(
        'letting_date',
        {
          ascending:
            false,
        }
      )
      .limit(
        1
      )

    if (contractError) {
      throw new Error(
        `Contract lookup failed: ${contractError.message}`
      )
    }

    const contract =
      contractRows?.[0]

    if (!contract) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            `Contract ${contractNumber} was not found.`,
        },
        {
          status:
            404,
        }
      )
    }

    // ========================================
    // LOAD CONTRACT DATA
    // ========================================

    const [
      bidders,
      counties,
      items,
    ] =
      await Promise.all([
        fetchAllByEq(
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
          'contract_id',
          contract.id
        ),

        fetchAllByEq(
          supabase,
          'bid_contract_counties',
          `
            id,
            contract_id,
            county
          `,
          'contract_id',
          contract.id
        ),

        fetchAllByEq(
          supabase,
          'bid_contract_items',
          `
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
          `,
          'contract_id',
          contract.id
        ),
      ])

    // ========================================
    // ITEM PRICES
    // ========================================

    const itemIds =
      items.map(
        item =>
          item.id
      )

    const prices =
      await fetchAllByIds(
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
    // LOOKUPS
    // ========================================

    const bidderMap =
      new Map(
        bidders.map(
          bidder => [
            bidder.id,
            bidder,
          ]
        )
      )

    const pricesByItem =
      new Map<
        string,
        any[]
      >()

    for (
      const price of
      prices
    ) {
      const existing =
        pricesByItem.get(
          price.contract_item_id
        ) ?? []

      existing.push(
        price
      )

      pricesByItem.set(
        price.contract_item_id,
        existing
      )
    }

    // ========================================
    // LOW BIDDER
    // ========================================

    const orderedBidders =
      [...bidders].sort(
        (
          a,
          b
        ) =>
          a.bidder_rank -
          b.bidder_rank
      )

    const lowBidder =
      orderedBidders.find(
        bidder =>
          bidder.is_low_bidder
      ) ??
      orderedBidders[0] ??
      null

    const lowBidTotal =
      lowBidder
        ? toNumber(
            lowBidder.total_bid
          )
        : 0

    // ========================================
    // BUILD BID SCHEDULE
    // ========================================

    const schedule =
      items
        .map(
          item => {
            const rawPrices =
              pricesByItem.get(
                item.id
              ) ?? []

            const enriched =
              rawPrices
                .map(
                  price => {
                    const bidder =
                      bidderMap.get(
                        price.bidder_id
                      )

                    if (!bidder) {
                      return null
                    }

                    return {
                      bidder_id:
                        bidder.id,

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

                      unit_price:
                        toNumber(
                          price.unit_price
                        ),

                      extended_amount:
                        toNumber(
                          price.extended_amount
                        ),
                    }
                  }
                )
                .filter(
                  (
                    row
                  ): row is NonNullable<
                    typeof row
                  > =>
                    row !==
                    null
                )

            // --------------------------------
            // PRICE RANKS
            // --------------------------------

            const ranked =
              [...enriched].sort(
                (
                  a,
                  b
                ) =>
                  a.extended_amount -
                  b.extended_amount
              )

            const rankMap =
              new Map<
                string,
                number
              >()

            let previousAmount:
              number | null =
              null

            let previousRank =
              0

            ranked.forEach(
              (
                row,
                index
              ) => {
                let rank =
                  index + 1

                if (
                  previousAmount !==
                    null &&
                  row.extended_amount ===
                    previousAmount
                ) {
                  rank =
                    previousRank
                }

                rankMap.set(
                  row.bidder_id,
                  rank
                )

                previousAmount =
                  row.extended_amount

                previousRank =
                  rank
              }
            )

            const extensionValues =
              enriched.map(
                row =>
                  row.extended_amount
              )

            const unitPrices =
              enriched.map(
                row =>
                  row.unit_price
              )

            const medianExtension =
              median(
                extensionValues
              )

            const minimumExtension =
              extensionValues.length >
              0
                ? Math.min(
                    ...extensionValues
                  )
                : null

            const maximumExtension =
              extensionValues.length >
              0
                ? Math.max(
                    ...extensionValues
                  )
                : null

            const winningPrice =
              enriched.find(
                row =>
                  row.is_low_bidder
              ) ??
              null

            const lowestItemPrice =
              ranked[0] ??
              null

            const itemPrices =
              enriched
                .map(
                  row => {
                    const overallBidDisadvantage =
                      lowBidder
                        ? row.bidder_total -
                          lowBidTotal
                        : null

                    const differenceVsWinningItem =
                      winningPrice
                        ? row.extended_amount -
                          winningPrice.extended_amount
                        : null

                    const impactPercent =
                      overallBidDisadvantage !==
                        null &&
                      overallBidDisadvantage >
                        0 &&
                      differenceVsWinningItem !==
                        null
                        ? (
                            differenceVsWinningItem /
                            overallBidDisadvantage
                          ) *
                          100
                        : null

                    const percentVsMedian =
                      medianExtension !==
                        null &&
                      medianExtension !==
                        0
                        ? (
                            (
                              row.extended_amount -
                              medianExtension
                            ) /
                            medianExtension
                          ) *
                          100
                        : null

                    const percentOfBid =
                      row.bidder_total >
                      0
                        ? (
                            row.extended_amount /
                            row.bidder_total
                          ) *
                          100
                        : null

                    return {
                      ...row,

                      item_price_rank:
                        rankMap.get(
                          row.bidder_id
                        ) ?? null,

                      difference_vs_winning_item:
                        differenceVsWinningItem !==
                        null
                          ? round(
                              differenceVsWinningItem
                            )
                          : null,

                      overall_bid_disadvantage:
                        overallBidDisadvantage !==
                        null
                          ? round(
                              overallBidDisadvantage
                            )
                          : null,

                      bid_disadvantage_impact_percent:
                        impactPercent !==
                        null
                          ? round(
                              impactPercent,
                              2
                            )
                          : null,

                      percent_vs_item_median:
                        percentVsMedian !==
                        null
                          ? round(
                              percentVsMedian,
                              2
                            )
                          : null,

                      percent_of_total_bid:
                        percentOfBid !==
                        null
                          ? round(
                              percentOfBid,
                              3
                            )
                          : null,
                    }
                  }
                )
                .sort(
                  (
                    a,
                    b
                  ) =>
                    a.bidder_rank -
                    b.bidder_rank
                )

            const winningBidderItem =
              itemPrices.find(
                price =>
                  price.is_low_bidder
              ) ??
              null

            return {
              id:
                item.id,

              line_number:
                item.line_number,

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

              section_number:
                item.section_number,

              section_description:
                item.section_description,

              engineer_estimate_unit_price:
                item.engineer_estimate_unit_price ===
                null
                  ? null
                  : toNumber(
                      item.engineer_estimate_unit_price
                    ),

              price_summary: {
                bidder_count:
                  itemPrices.length,

                minimum_unit_price:
                  unitPrices.length >
                  0
                    ? round(
                        Math.min(
                          ...unitPrices
                        )
                      )
                    : null,

                median_unit_price:
                  round(
                    median(
                      unitPrices
                    )
                  ),

                average_unit_price:
                  round(
                    average(
                      unitPrices
                    )
                  ),

                maximum_unit_price:
                  unitPrices.length >
                  0
                    ? round(
                        Math.max(
                          ...unitPrices
                        )
                      )
                    : null,

                minimum_extended_amount:
                  round(
                    minimumExtension
                  ),

                median_extended_amount:
                  round(
                    medianExtension
                  ),

                maximum_extended_amount:
                  round(
                    maximumExtension
                  ),

                lowest_item_bidder:
                  lowestItemPrice
                    ? {
                        bidder_name:
                          lowestItemPrice.bidder_name,

                        bidder_rank:
                          lowestItemPrice.bidder_rank,

                        extended_amount:
                          round(
                            lowestItemPrice.extended_amount
                          ),
                      }
                    : null,

                winning_bidder_item_rank:
                  winningBidderItem
                    ?.item_price_rank ??
                  null,
              },

              prices:
                itemPrices,
            }
          }
        )
        .sort(
          (
            a,
            b
          ) => {
            const lineA =
              Number(
                a.line_number
              )

            const lineB =
              Number(
                b.line_number
              )

            if (
              Number.isFinite(
                lineA
              ) &&
              Number.isFinite(
                lineB
              )
            ) {
              return (
                lineA -
                lineB
              )
            }

            return String(
              a.line_number
            ).localeCompare(
              String(
                b.line_number
              )
            )
          }
        )

    // ========================================
    // SELECTED ITEM
    // ========================================

    const selectedItemId =
      request.nextUrl
        .searchParams
        .get(
          'itemId'
        )

    const selectedItemNumber =
      request.nextUrl
        .searchParams
        .get(
          'item'
        )

    let selectedItem =
      null as
        | (typeof schedule)[number]
        | null

    if (
      selectedItemId
    ) {
      selectedItem =
        schedule.find(
          item =>
            item.id ===
            selectedItemId
        ) ??
        null
    }

    if (
      !selectedItem &&
      selectedItemNumber
    ) {
      selectedItem =
        schedule.find(
          item =>
            item.item_number
              .toUpperCase() ===
            selectedItemNumber
              .toUpperCase()
        ) ??
        null
    }

    // ========================================
    // SELECTED ITEM ANALYSIS
    // ========================================

    let selectedItemAnalysis:
      any =
      null

    if (
      selectedItem
    ) {
      const winnerItemPrice =
        selectedItem
          .prices
          .find(
            price =>
              price.is_low_bidder
          ) ??
        null

      const lowestItemPrice =
        [...selectedItem.prices]
          .sort(
            (
              a,
              b
            ) =>
              a.extended_amount -
              b.extended_amount
          )[0] ??
        null

      selectedItemAnalysis =
        {
          item_id:
            selectedItem.id,

          item_number:
            selectedItem.item_number,

          description:
            selectedItem.description,

          quantity:
            selectedItem.quantity,

          unit:
            selectedItem.unit,

          bidder_count:
            selectedItem.prices.length,

          winning_bidder:
            lowBidder
              ? {
                  bidder_name:
                    lowBidder.bidder_name,

                  total_bid:
                    round(
                      lowBidTotal
                    ),
                }
              : null,

          winning_bidder_item_price:
            winnerItemPrice
              ? {
                  unit_price:
                    winnerItemPrice.unit_price,

                  extended_amount:
                    winnerItemPrice.extended_amount,

                  item_price_rank:
                    winnerItemPrice.item_price_rank,

                  rank_out_of:
                    selectedItem.prices.length,

                  percent_vs_item_median:
                    winnerItemPrice.percent_vs_item_median,

                  percent_of_total_bid:
                    winnerItemPrice.percent_of_total_bid,
                }
              : null,

          lowest_item_bidder:
            lowestItemPrice
              ? {
                  bidder_name:
                    lowestItemPrice.bidder_name,

                  bidder_rank:
                    lowestItemPrice.bidder_rank,

                  unit_price:
                    lowestItemPrice.unit_price,

                  extended_amount:
                    lowestItemPrice.extended_amount,

                  is_contract_winner:
                    lowestItemPrice.is_low_bidder,
                }
              : null,

          price_summary:
            selectedItem.price_summary,

          bidder_analysis:
            selectedItem.prices,
        }
    }

    // ========================================
    // RESPONSE
    // ========================================

    return NextResponse.json({
      success:
        true,

      contract: {
        id:
          contract.id,

        contract_number:
          contract.contract_number,

        project_name:
          contract.project_name,

        letting_date:
          contract.letting_date,

        call_order:
          contract.call_order,

        district:
          contract.district,

        contract_time:
          contract.contract_time,

        counties:
          counties.map(
            row =>
              row.county
          ),

        bidder_count:
          orderedBidders.length,

        item_count:
          schedule.length,

        price_count:
          prices.length,

        low_bidder:
          lowBidder
            ? {
                id:
                  lowBidder.id,

                bidder_name:
                  lowBidder.bidder_name,

                bidder_rank:
                  lowBidder.bidder_rank,

                total_bid:
                  round(
                    toNumber(
                      lowBidder.total_bid
                    )
                  ),
              }
            : null,
      },

      bidders:
        orderedBidders.map(
          bidder => ({
            id:
              bidder.id,

            bidder_name:
              bidder.bidder_name,

            bidder_rank:
              bidder.bidder_rank,

            total_bid:
              round(
                toNumber(
                  bidder.total_bid
                )
              ),

            percent_of_low_bid:
              bidder.percent_of_low_bid ===
              null
                ? null
                : round(
                    toNumber(
                      bidder.percent_of_low_bid
                    ),
                    3
                  ),

            is_low_bidder:
              Boolean(
                bidder.is_low_bidder
              ),

            difference_from_low_bid:
              lowBidder
                ? round(
                    toNumber(
                      bidder.total_bid
                    ) -
                    lowBidTotal
                  )
                : null,

            difference_from_low_bid_percent:
              lowBidder &&
              lowBidTotal >
                0
                ? round(
                    (
                      (
                        toNumber(
                          bidder.total_bid
                        ) -
                        lowBidTotal
                      ) /
                      lowBidTotal
                    ) *
                      100,
                    2
                  )
                : null,
          })
        ),

      selected_item:
        selectedItem,

      selected_item_analysis:
        selectedItemAnalysis,

      items:
        schedule,
    })
  } catch (error) {
    console.error(
      'Bid contract API error:',
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
