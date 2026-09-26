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

function toNumber(
  value: unknown
) {
  const result =
    Number(value)

  return Number.isFinite(result)
    ? result
    : 0
}

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
                }
              ),
          },
        }
      )

    const q =
      (
        request
          .nextUrl
          .searchParams
          .get('q') ??
        ''
      )
        .trim()

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

    // ==========================================
    // FIND MATCHING HISTORICAL ITEMS
    // ==========================================

    const {
      data: items,
      error: itemError,
    } = await supabase
      .from(
        'bid_contract_items'
      )
      .select(`
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
      `)
      .or(
        `item_number.ilike.%${q}%,description.ilike.%${q}%`
      )
      .limit(500)

    if (itemError) {
      throw new Error(
        `Historical item search failed: ${itemError.message}`
      )
    }

    if (
      !items ||
      items.length === 0
    ) {
      return NextResponse.json({
        success:
          true,

        query:
          q,

        matches:
          0,

        summary:
          null,

        results:
          [],
      })
    }

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

    // ==========================================
    // PRICES
    // ==========================================

    const {
      data: prices,
      error: priceError,
    } = await supabase
      .from(
        'bid_item_prices'
      )
      .select(`
        contract_item_id,
        bidder_id,
        unit_price,
        extended_amount
      `)
      .in(
        'contract_item_id',
        itemIds
      )

    if (priceError) {
      throw new Error(
        `Historical price query failed: ${priceError.message}`
      )
    }

    // ==========================================
    // CONTRACTS
    // ==========================================

    const {
      data: contracts,
      error:
        contractError,
    } = await supabase
      .from(
        'bid_contracts'
      )
      .select(`
        id,
        contract_number,
        project_name,
        letting_date,
        call_order,
        district,
        contract_time
      `)
      .in(
        'id',
        contractIds
      )

    if (contractError) {
      throw new Error(
        `Contract lookup failed: ${contractError.message}`
      )
    }

    // ==========================================
    // COUNTIES
    // ==========================================

    const {
      data: counties,
      error:
        countyError,
    } = await supabase
      .from(
        'bid_contract_counties'
      )
      .select(`
        contract_id,
        county
      `)
      .in(
        'contract_id',
        contractIds
      )

    if (countyError) {
      throw new Error(
        `County lookup failed: ${countyError.message}`
      )
    }

    // ==========================================
    // BIDDERS
    // ==========================================

    const bidderIds =
      Array.from(
        new Set(
          (
            prices ??
            []
          ).map(
            price =>
              price.bidder_id
          )
        )
      )

    const {
      data: bidders,
      error:
        bidderError,
    } =
      bidderIds.length > 0
        ? await supabase
            .from(
              'bid_contract_bidders'
            )
            .select(`
              id,
              contract_id,
              bidder_name,
              bidder_rank,
              total_bid,
              percent_of_low_bid,
              is_low_bidder
            `)
            .in(
              'id',
              bidderIds
            )
        : {
            data: [],
            error: null,
          }

    if (bidderError) {
      throw new Error(
        `Bidder lookup failed: ${bidderError.message}`
      )
    }

    // ==========================================
    // LOOKUP MAPS
    // ==========================================

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
        (
          contracts ??
          []
        ).map(
          contract => [
            contract.id,
            contract,
          ]
        )
      )

    const bidderMap =
      new Map(
        (
          bidders ??
          []
        ).map(
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
      counties ?? []
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

    // ==========================================
    // BUILD PRICE HISTORY
    // ==========================================

    const results =
      (
        prices ??
        []
      )
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
                bidder.is_low_bidder,

              bidder_total:
                toNumber(
                  bidder.total_bid
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
            row !== null
        )
        .sort(
          (a, b) => {
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

            return (
              dateB -
              dateA
            )
          }
        )

    // ==========================================
    // SUMMARY STATISTICS
    // ==========================================

    const unitPrices =
      results
        .map(
          result =>
            result.unit_price
        )
        .filter(
          price =>
            Number.isFinite(
              price
            ) &&
            price >= 0
        )

    const lowBidPrices =
      results
        .filter(
          result =>
            result.is_low_bidder
        )
        .map(
          result =>
            result.unit_price
        )

    const average =
      unitPrices.length > 0
        ? unitPrices.reduce(
            (
              sum,
              value
            ) =>
              sum +
              value,
            0
          ) /
          unitPrices.length
        : null

    const lowBidAverage =
      lowBidPrices.length >
      0
        ? lowBidPrices.reduce(
            (
              sum,
              value
            ) =>
              sum +
              value,
            0
          ) /
          lowBidPrices.length
        : null

    const uniqueContracts =
      new Set(
        results.map(
          result =>
            result.contract_number
        )
      )

    const uniqueBidders =
      new Set(
        results.map(
          result =>
            result.bidder_name
        )
      )

    const uniqueItems =
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

      matching_items:
        items.length,

      summary: {
        item_numbers:
          uniqueItems,

        contracts:
          uniqueContracts.size,

        bidders:
          uniqueBidders.size,

        price_observations:
          unitPrices.length,

        minimum_unit_price:
          unitPrices.length > 0
            ? Math.min(
                ...unitPrices
              )
            : null,

        average_unit_price:
          average !== null
            ? Number(
                average.toFixed(
                  4
                )
              )
            : null,

        maximum_unit_price:
          unitPrices.length > 0
            ? Math.max(
                ...unitPrices
              )
            : null,

        low_bid_average_unit_price:
          lowBidAverage !==
          null
            ? Number(
                lowBidAverage.toFixed(
                  4
                )
              )
            : null,
      },

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
