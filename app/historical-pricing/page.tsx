'use client'

import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'

import {
  useRouter,
} from 'next/navigation'

// ==========================================
// TYPES
// ==========================================

type PriceStats = {
  minimum: number | null
  p25: number | null
  median: number | null
  average: number | null
  p75: number | null
  maximum: number | null
}

type HistoricalRange = {
  low: number
  high: number
  median: number
  basis: string
  observations: number
}

type Summary = {
  contracts: number
  bidders: number
  price_observations: number
  low_bid_observations: number
  units: string[]

  unit_price: PriceStats

  low_bid_unit_price:
    PriceStats

  extended_amount: {
    median: number | null
    average: number | null
  }

  quantity: {
    minimum: number | null
    median: number | null
    average: number | null
    maximum: number | null
    spread_ratio: number | null
    wide_quantity_range: boolean
  }

  suggested_historical_range:
    HistoricalRange | null
}

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

type ItemGroup = {
  item_number: string
  description: string
  units: string[]
  summary: Summary
  results: HistoryRow[]
}

type ApiResponse = {
  success: boolean

  query?: string

  matching_items?: number

  matched_item_numbers?: string[]

  filtered_results?: number

  summary?: Summary | null

  item_groups?: ItemGroup[]

  results?: HistoryRow[]

  error?: string
  message?: string
}

type SortDirection =
  | 'asc'
  | 'desc'

type HistorySortKey =
  | 'letting_date'
  | 'contract_number'
  | 'project_name'
  | 'county'
  | 'quantity'
  | 'unit'
  | 'bidder_name'
  | 'bidder_rank'
  | 'unit_price'
  | 'extended_amount'
  | 'bidder_total'

type SortState = {
  key: HistorySortKey
  direction: SortDirection
}

// ==========================================
// FORMATTERS
// ==========================================

function money(
  value:
    | number
    | null
    | undefined
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '—'
  }

  return new Intl
    .NumberFormat(
      'en-US',
      {
        style:
          'currency',

        currency:
          'USD',

        maximumFractionDigits:
          2,
      }
    )
    .format(
      value
    )
}

function number(
  value:
    | number
    | null
    | undefined
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '—'
  }

  return new Intl
    .NumberFormat(
      'en-US',
      {
        maximumFractionDigits:
          2,
      }
    )
    .format(
      value
    )
}

function formatDate(
  value:
    | string
    | null
) {
  if (!value) {
    return '—'
  }

  const date =
    new Date(
      `${value}T00:00:00`
    )

  return date
    .toLocaleDateString(
      'en-US',
      {
        year:
          'numeric',

        month:
          'short',

        day:
          'numeric',
      }
    )
}

// ==========================================
// SORTING
// ==========================================

function compareSortableValues(
  a:
    | string
    | number
    | null
    | undefined,
  b:
    | string
    | number
    | null
    | undefined,
  direction:
    SortDirection
) {
  const aMissing =
    a === null ||
    a === undefined

  const bMissing =
    b === null ||
    b === undefined

  if (
    aMissing &&
    bMissing
  ) {
    return 0
  }

  if (aMissing) {
    return 1
  }

  if (bMissing) {
    return -1
  }

  let result =
    0

  if (
    typeof a ===
      'number' &&
    typeof b ===
      'number'
  ) {
    result =
      a - b
  } else {
    result =
      String(a)
        .localeCompare(
          String(b),
          undefined,
          {
            numeric:
              true,

            sensitivity:
              'base',
          }
        )
  }

  return direction ===
    'asc'
    ? result
    : -result
}

// ==========================================
// PAGE
// ==========================================

export default function HistoricalPricingPage() {
  const router =
    useRouter()

  const [
    query,
    setQuery,
  ] =
    useState('')

  const [
    quantity,
    setQuantity,
  ] =
    useState('')

  const [
    contractNumber,
    setContractNumber,
  ] =
    useState('')

  const [
    county,
    setCounty,
  ] =
    useState('')

  const [
    district,
    setDistrict,
  ] =
    useState('')

  const [
    bidder,
    setBidder,
  ] =
    useState('')

  const [
    fromDate,
    setFromDate,
  ] =
    useState('')

  const [
    toDate,
    setToDate,
  ] =
    useState('')

  const [
    lowBidOnly,
    setLowBidOnly,
  ] =
    useState(false)

  const [
    data,
    setData,
  ] =
    useState<
      ApiResponse | null
    >(null)

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null)

  const [
    historySort,
    setHistorySort,
  ] =
    useState<SortState>({
      key:
        'letting_date',

      direction:
        'desc',
    })

  // ========================================
  // SEARCH
  // ========================================

  async function search(
    event:
      FormEvent
  ) {
    event.preventDefault()

    if (
      !query.trim()
    ) {
      setError(
        'Enter an NJDOT item number or description.'
      )

      return
    }

    setLoading(
      true
    )

    setError(
      null
    )

    try {
      const params =
        new URLSearchParams()

      params.set(
        'q',
        query.trim()
      )

      if (
        contractNumber.trim()
      ) {
        params.set(
          'contract',
          contractNumber.trim()
        )
      }

      if (
        quantity.trim()
      ) {
        params.set(
          'quantity',
          quantity.trim()
        )
      }

      if (
        county.trim()
      ) {
        params.set(
          'county',
          county.trim()
        )
      }

      if (
        district.trim()
      ) {
        params.set(
          'district',
          district.trim()
        )
      }

      if (
        bidder.trim()
      ) {
        params.set(
          'bidder',
          bidder.trim()
        )
      }

      if (
        fromDate
      ) {
        params.set(
          'from',
          fromDate
        )
      }

      if (
        toDate
      ) {
        params.set(
          'to',
          toDate
        )
      }

      if (
        lowBidOnly
      ) {
        params.set(
          'lowBidOnly',
          'true'
        )
      }

      const response =
        await fetch(
          `/api/historical-pricing?${params.toString()}`,
          {
            cache:
              'no-store',
          }
        )

      const json =
        await response
          .json()

      if (
        !response.ok ||
        !json.success
      ) {
        throw new Error(
          json.error ??
          json.message ??
          'Historical pricing search failed.'
        )
      }

      setData(
        json
      )
    } catch (
      searchError
    ) {
      setError(
        searchError instanceof
          Error
          ? searchError.message
          : String(
              searchError
            )
      )
    } finally {
      setLoading(
        false
      )
    }
  }

  // ========================================
  // CLEAR FILTERS
  // ========================================

  function clearFilters() {
    setQuantity('')
    setContractNumber('')
    setCounty('')
    setDistrict('')
    setBidder('')
    setFromDate('')
    setToDate('')

    setLowBidOnly(
      false
    )
  }

  // ========================================
  // SUMMARY
  // ========================================

  const summary =
    data?.summary ??
    (
      data?.item_groups
        ?.length === 1
        ? data
            .item_groups[0]
            .summary
        : null
    )

  const rows =
    data?.results ??
    []

  // ========================================
  // SORT HISTORICAL RESULTS
  // ========================================

  const sortedRows =
    useMemo(
      () => {
        return [
          ...rows,
        ].sort(
          (
            a,
            b
          ) => {
            let aValue:
              | string
              | number
              | null =
              null

            let bValue:
              | string
              | number
              | null =
              null

            switch (
              historySort.key
            ) {
              case 'letting_date':
                aValue =
                  a.letting_date

                bValue =
                  b.letting_date
                break

              case 'contract_number':
                aValue =
                  a.contract_number

                bValue =
                  b.contract_number
                break

              case 'project_name':
                aValue =
                  a.project_name

                bValue =
                  b.project_name
                break

              case 'county':
                aValue =
                  a.counties.join(
                    ', '
                  )

                bValue =
                  b.counties.join(
                    ', '
                  )
                break

              case 'quantity':
                aValue =
                  a.quantity

                bValue =
                  b.quantity
                break

              case 'unit':
                aValue =
                  a.unit

                bValue =
                  b.unit
                break

              case 'bidder_name':
                aValue =
                  a.bidder_name

                bValue =
                  b.bidder_name
                break

              case 'bidder_rank':
                aValue =
                  a.bidder_rank

                bValue =
                  b.bidder_rank
                break

              case 'unit_price':
                aValue =
                  a.unit_price

                bValue =
                  b.unit_price
                break

              case 'extended_amount':
                aValue =
                  a.extended_amount

                bValue =
                  b.extended_amount
                break

              case 'bidder_total':
                aValue =
                  a.bidder_total

                bValue =
                  b.bidder_total
                break
            }

            return compareSortableValues(
              aValue,
              bValue,
              historySort.direction
            )
          }
        )
      },
      [
        rows,
        historySort,
      ]
    )

  function toggleHistorySort(
    key:
      HistorySortKey
  ) {
    setHistorySort(
      current => ({
        key,

        direction:
          current.key ===
            key &&
          current.direction ===
            'asc'
            ? 'desc'
            : 'asc',
      })
    )
  }

  // ========================================
  // OPEN CONTRACT
  // ========================================

  function openHistoricalBid(
    row:
      HistoryRow
  ) {
    router.push(
      `/bid-results/${encodeURIComponent(
        row.contract_number
      )}?item=${encodeURIComponent(
        row.item_number
      )}`
    )
  }

  // ========================================
  // RENDER
  // ========================================

  return (
    <main
      style={{
        minHeight:
          '100vh',

        background:
          '#f5f6f8',

        padding:
          '32px',
      }}
    >
      <div
        style={{
          maxWidth:
            '1500px',

          margin:
            '0 auto',
        }}
      >
        {/* ================================= */}
        {/* HEADER */}
        {/* ================================= */}

        <div
          style={{
            marginBottom:
              '28px',
          }}
        >
          <div
            style={{
              fontSize:
                '13px',

              fontWeight:
                700,

              letterSpacing:
                '0.08em',

              color:
                '#667085',

              textTransform:
                'uppercase',

              marginBottom:
                '8px',
            }}
          >
            CivilBid Intelligence
          </div>

          <h1
            style={{
              margin:
                0,

              fontSize:
                '34px',

              lineHeight:
                1.15,

              color:
                '#101828',
            }}
          >
            Historical Pricing
          </h1>

          <p
            style={{
              marginTop:
                '10px',

              marginBottom:
                0,

              color:
                '#667085',

              maxWidth:
                '800px',
            }}
          >
            Search NJDOT bid
            history, compare
            quantities and
            locations, and
            analyze winning
            unit prices.
          </p>
        </div>

        {/* ================================= */}
        {/* SEARCH */}
        {/* ================================= */}

        <form
          onSubmit={
            search
          }
        >
          <div
            style={{
              background:
                '#ffffff',

              border:
                '1px solid #e4e7ec',

              borderRadius:
                '14px',

              padding:
                '22px',

              marginBottom:
                '20px',

              boxShadow:
                '0 1px 3px rgba(16,24,40,.06)',
            }}
          >
            {/* MAIN SEARCH */}

            <div
              style={{
                display:
                  'grid',

                gridTemplateColumns:
                  'minmax(300px,2fr) minmax(140px,1fr)',

                gap:
                  '14px',

                marginBottom:
                  '14px',
              }}
            >
              <label>
                <div
                  style={
                    labelStyle
                  }
                >
                  Item number
                  or description
                </div>

                <input
                  value={
                    query
                  }
                  onChange={
                    event =>
                      setQuery(
                        event
                          .target
                          .value
                      )
                  }
                  placeholder="151006M or PERFORMANCE BOND"
                  style={
                    inputStyle
                  }
                />
              </label>

              <label>
                <div
                  style={
                    labelStyle
                  }
                >
                  Target quantity
                </div>

                <input
                  value={
                    quantity
                  }
                  onChange={
                    event =>
                      setQuantity(
                        event
                          .target
                          .value
                      )
                  }
                  type="number"
                  step="any"
                  placeholder="Optional"
                  style={
                    inputStyle
                  }
                />
              </label>
            </div>

            {/* FILTER ROW */}

            <div
              style={{
                display:
                  'grid',

                gridTemplateColumns:
                  'repeat(auto-fit, minmax(145px,1fr))',

                gap:
                  '14px',

                marginBottom:
                  '18px',
              }}
            >
              {/* CONTRACT */}

              <label>
                <div
                  style={
                    labelStyle
                  }
                >
                  Contract
                </div>

                <input
                  value={
                    contractNumber
                  }
                  onChange={
                    event =>
                      setContractNumber(
                        event
                          .target
                          .value
                      )
                  }
                  placeholder="25139"
                  style={
                    inputStyle
                  }
                />
              </label>

              {/* COUNTY */}

              <label>
                <div
                  style={
                    labelStyle
                  }
                >
                  County
                </div>

                <input
                  value={
                    county
                  }
                  onChange={
                    event =>
                      setCounty(
                        event
                          .target
                          .value
                      )
                  }
                  placeholder="MONMOUTH"
                  style={
                    inputStyle
                  }
                />
              </label>

              {/* DISTRICT */}

              <label>
                <div
                  style={
                    labelStyle
                  }
                >
                  District
                </div>

                <input
                  value={
                    district
                  }
                  onChange={
                    event =>
                      setDistrict(
                        event
                          .target
                          .value
                      )
                  }
                  placeholder="C1"
                  style={
                    inputStyle
                  }
                />
              </label>

              {/* BIDDER */}

              <label>
                <div
                  style={
                    labelStyle
                  }
                >
                  Bidder
                </div>

                <input
                  value={
                    bidder
                  }
                  onChange={
                    event =>
                      setBidder(
                        event
                          .target
                          .value
                      )
                  }
                  placeholder="Contractor"
                  style={
                    inputStyle
                  }
                />
              </label>

              {/* FROM */}

              <label>
                <div
                  style={
                    labelStyle
                  }
                >
                  From
                </div>

                <input
                  value={
                    fromDate
                  }
                  onChange={
                    event =>
                      setFromDate(
                        event
                          .target
                          .value
                      )
                  }
                  type="date"
                  style={
                    inputStyle
                  }
                />
              </label>

              {/* TO */}

              <label>
                <div
                  style={
                    labelStyle
                  }
                >
                  To
                </div>

                <input
                  value={
                    toDate
                  }
                  onChange={
                    event =>
                      setToDate(
                        event
                          .target
                          .value
                      )
                  }
                  type="date"
                  style={
                    inputStyle
                  }
                />
              </label>
            </div>

            {/* ACTION ROW */}

            <div
              style={{
                display:
                  'flex',

                justifyContent:
                  'space-between',

                alignItems:
                  'center',

                gap:
                  '16px',

                flexWrap:
                  'wrap',
              }}
            >
              <label
                style={{
                  display:
                    'flex',

                  alignItems:
                    'center',

                  gap:
                    '8px',

                  color:
                    '#344054',

                  fontSize:
                    '14px',

                  fontWeight:
                    600,
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    lowBidOnly
                  }
                  onChange={
                    event =>
                      setLowBidOnly(
                        event
                          .target
                          .checked
                      )
                  }
                />

                Winning bids only
              </label>

              <div
                style={{
                  display:
                    'flex',

                  gap:
                    '10px',
                }}
              >
                <button
                  type="button"
                  onClick={
                    clearFilters
                  }
                  style={
                    secondaryButtonStyle
                  }
                >
                  Clear filters
                </button>

                <button
                  type="submit"
                  disabled={
                    loading
                  }
                  style={{
                    ...primaryButtonStyle,

                    opacity:
                      loading
                        ? 0.65
                        : 1,
                  }}
                >
                  {loading
                    ? 'Searching...'
                    : 'Search pricing'}
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* ================================= */}
        {/* ERROR */}
        {/* ================================= */}

        {error && (
          <div
            style={{
              padding:
                '14px 16px',

              borderRadius:
                '10px',

              background:
                '#fff1f0',

              border:
                '1px solid #fecdca',

              color:
                '#b42318',

              marginBottom:
                '20px',
            }}
          >
            {error}
          </div>
        )}

        {/* ================================= */}
        {/* NO RESULTS */}
        {/* ================================= */}

        {data &&
          data.filtered_results ===
            0 && (
            <div
              style={{
                ...cardStyle,

                marginBottom:
                  '18px',
              }}
            >
              No historical
              pricing matched
              these filters.
            </div>
          )}

        {/* ================================= */}
        {/* SUMMARY */}
        {/* ================================= */}

        {summary && (
          <>
            {/* RECOMMENDED RANGE */}

            <div
              style={{
                ...cardStyle,

                marginBottom:
                  '18px',

                padding:
                  '24px',
              }}
            >
              <div
                style={{
                  display:
                    'flex',

                  justifyContent:
                    'space-between',

                  alignItems:
                    'flex-start',

                  gap:
                    '20px',

                  flexWrap:
                    'wrap',
                }}
              >
                <div>
                  <div
                    style={{
                      color:
                        '#667085',

                      fontSize:
                        '13px',

                      fontWeight:
                        700,

                      textTransform:
                        'uppercase',

                      letterSpacing:
                        '.06em',

                      marginBottom:
                        '8px',
                    }}
                  >
                    Suggested
                    historical range
                  </div>

                  {summary
                    .suggested_historical_range ? (
                    <>
                      <div
                        style={{
                          fontSize:
                            '36px',

                          fontWeight:
                            800,

                          color:
                            '#101828',
                        }}
                      >
                        {money(
                          summary
                            .suggested_historical_range
                            .low
                        )}

                        {' – '}

                        {money(
                          summary
                            .suggested_historical_range
                            .high
                        )}
                      </div>

                      <div
                        style={{
                          marginTop:
                            '6px',

                          color:
                            '#667085',
                        }}
                      >
                        Median{' '}

                        <strong>
                          {money(
                            summary
                              .suggested_historical_range
                              .median
                          )}
                        </strong>

                        {' · '}

                        {
                          summary
                            .suggested_historical_range
                            .observations
                        }{' '}
                        observations
                      </div>
                    </>
                  ) : (
                    <div>
                      Not enough
                      comparable
                      observations.
                    </div>
                  )}
                </div>

                <div
                  style={{
                    background:
                      '#f8fafc',

                    borderRadius:
                      '10px',

                    padding:
                      '12px 16px',

                    color:
                      '#475467',

                    fontSize:
                      '13px',

                    maxWidth:
                      '420px',
                  }}
                >
                  Historical range
                  uses the middle
                  50% of comparable
                  winning bids when
                  enough winning
                  observations are
                  available.
                </div>
              </div>
            </div>

            {/* STAT CARDS */}

            <div
              style={{
                display:
                  'grid',

                gridTemplateColumns:
                  'repeat(auto-fit, minmax(150px,1fr))',

                gap:
                  '12px',

                marginBottom:
                  '18px',
              }}
            >
              <StatCard
                label="Contracts"
                value={number(
                  summary
                    .contracts
                )}
              />

              <StatCard
                label="Observations"
                value={number(
                  summary
                    .price_observations
                )}
              />

              <StatCard
                label="Winning bids"
                value={number(
                  summary
                    .low_bid_observations
                )}
              />

              <StatCard
                label="All-bid median"
                value={money(
                  summary
                    .unit_price
                    .median
                )}
              />

              <StatCard
                label="Winning median"
                value={money(
                  summary
                    .low_bid_unit_price
                    .median
                )}
              />

              <StatCard
                label="Winning average"
                value={money(
                  summary
                    .low_bid_unit_price
                    .average
                )}
              />
            </div>

            {/* PRICE DISTRIBUTION */}

            <div
              style={{
                display:
                  'grid',

                gridTemplateColumns:
                  'repeat(auto-fit, minmax(320px,1fr))',

                gap:
                  '18px',

                marginBottom:
                  '18px',
              }}
            >
              <PriceBlock
                title="All bidder pricing"
                stats={
                  summary
                    .unit_price
                }
              />

              <PriceBlock
                title="Winning bidder pricing"
                stats={
                  summary
                    .low_bid_unit_price
                }
              />
            </div>
          </>
        )}

        {/* ================================= */}
        {/* MULTIPLE ITEM MATCHES */}
        {/* ================================= */}

        {data
          ?.item_groups &&
          data
            .item_groups
            .length >
            1 && (
            <div
              style={{
                ...cardStyle,

                marginBottom:
                  '18px',
              }}
            >
              <h2
                style={{
                  marginTop:
                    0,

                  fontSize:
                    '18px',

                  color:
                    '#101828',
                }}
              >
                Matching NJDOT
                items
              </h2>

              <div
                style={{
                  display:
                    'grid',

                  gap:
                    '10px',
                }}
              >
                {data
                  .item_groups
                  .map(
                    group => (
                      <button
                        type="button"
                        key={
                          group
                            .item_number
                        }
                        onClick={() => {
                          setQuery(
                            group
                              .item_number
                          )
                        }}
                        style={{
                          textAlign:
                            'left',

                          background:
                            '#ffffff',

                          border:
                            '1px solid #e4e7ec',

                          borderRadius:
                            '9px',

                          padding:
                            '12px 14px',

                          cursor:
                            'pointer',
                        }}
                      >
                        <strong>
                          {
                            group
                              .item_number
                          }
                        </strong>

                        {' — '}

                        {
                          group
                            .description
                        }

                        <div
                          style={{
                            color:
                              '#667085',

                            fontSize:
                              '12px',

                            marginTop:
                              '4px',
                          }}
                        >
                          {
                            group
                              .summary
                              .contracts
                          }{' '}
                          contracts

                          {' · '}

                          {
                            group
                              .summary
                              .price_observations
                          }{' '}
                          prices
                        </div>
                      </button>
                    )
                  )}
              </div>
            </div>
          )}

        {/* ================================= */}
        {/* RESULTS TABLE */}
        {/* ================================= */}

        {rows.length >
          0 && (
          <div
            style={{
              ...cardStyle,

              padding:
                0,

              overflow:
                'hidden',
            }}
          >
            <div
              style={{
                padding:
                  '18px 20px',

                borderBottom:
                  '1px solid #e4e7ec',
              }}
            >
              <h2
                style={{
                  margin:
                    0,

                  fontSize:
                    '18px',

                  color:
                    '#101828',
                }}
              >
                Historical bids
              </h2>

              <div
                style={{
                  marginTop:
                    '4px',

                  color:
                    '#667085',

                  fontSize:
                    '13px',
                }}
              >
                {rows.length}{' '}
                pricing observations

                {' · '}

                Click a column
                header to sort

                {' · '}

                Click any bid
                to open the full
                contract
              </div>
            </div>

            <div
              style={{
                overflowX:
                  'auto',
              }}
            >
              <table
                style={{
                  width:
                    '100%',

                  borderCollapse:
                    'collapse',

                  minWidth:
                    '1350px',
                }}
              >
                <thead>
                  <tr>
                    <TableHeader>
                      <SortLabel
                        active={
                          historySort.key ===
                          'letting_date'
                        }
                        direction={
                          historySort.direction
                        }
                        onClick={() =>
                          toggleHistorySort(
                            'letting_date'
                          )
                        }
                      >
                        Date
                      </SortLabel>
                    </TableHeader>

                    <TableHeader>
                      <SortLabel
                        active={
                          historySort.key ===
                          'contract_number'
                        }
                        direction={
                          historySort.direction
                        }
                        onClick={() =>
                          toggleHistorySort(
                            'contract_number'
                          )
                        }
                      >
                        Contract
                      </SortLabel>
                    </TableHeader>

                    <TableHeader>
                      <SortLabel
                        active={
                          historySort.key ===
                          'project_name'
                        }
                        direction={
                          historySort.direction
                        }
                        onClick={() =>
                          toggleHistorySort(
                            'project_name'
                          )
                        }
                      >
                        Project
                      </SortLabel>
                    </TableHeader>

                    <TableHeader>
                      <SortLabel
                        active={
                          historySort.key ===
                          'county'
                        }
                        direction={
                          historySort.direction
                        }
                        onClick={() =>
                          toggleHistorySort(
                            'county'
                          )
                        }
                      >
                        County
                      </SortLabel>
                    </TableHeader>

                    <TableHeader>
                      <SortLabel
                        active={
                          historySort.key ===
                          'quantity'
                        }
                        direction={
                          historySort.direction
                        }
                        onClick={() =>
                          toggleHistorySort(
                            'quantity'
                          )
                        }
                      >
                        Qty
                      </SortLabel>
                    </TableHeader>

                    <TableHeader>
                      <SortLabel
                        active={
                          historySort.key ===
                          'unit'
                        }
                        direction={
                          historySort.direction
                        }
                        onClick={() =>
                          toggleHistorySort(
                            'unit'
                          )
                        }
                      >
                        Unit
                      </SortLabel>
                    </TableHeader>

                    <TableHeader>
                      <SortLabel
                        active={
                          historySort.key ===
                          'bidder_name'
                        }
                        direction={
                          historySort.direction
                        }
                        onClick={() =>
                          toggleHistorySort(
                            'bidder_name'
                          )
                        }
                      >
                        Bidder
                      </SortLabel>
                    </TableHeader>

                    <TableHeader>
                      <SortLabel
                        active={
                          historySort.key ===
                          'bidder_rank'
                        }
                        direction={
                          historySort.direction
                        }
                        onClick={() =>
                          toggleHistorySort(
                            'bidder_rank'
                          )
                        }
                      >
                        Rank
                      </SortLabel>
                    </TableHeader>

                    <TableHeader>
                      <SortLabel
                        active={
                          historySort.key ===
                          'unit_price'
                        }
                        direction={
                          historySort.direction
                        }
                        onClick={() =>
                          toggleHistorySort(
                            'unit_price'
                          )
                        }
                      >
                        Unit Price
                      </SortLabel>
                    </TableHeader>

                    <TableHeader>
                      <SortLabel
                        active={
                          historySort.key ===
                          'extended_amount'
                        }
                        direction={
                          historySort.direction
                        }
                        onClick={() =>
                          toggleHistorySort(
                            'extended_amount'
                          )
                        }
                      >
                        Extension
                      </SortLabel>
                    </TableHeader>

                    <TableHeader>
                      <SortLabel
                        active={
                          historySort.key ===
                          'bidder_total'
                        }
                        direction={
                          historySort.direction
                        }
                        onClick={() =>
                          toggleHistorySort(
                            'bidder_total'
                          )
                        }
                      >
                        Bid Total
                      </SortLabel>
                    </TableHeader>
                  </tr>
                </thead>

                <tbody>
                  {sortedRows.map(
                    (
                      row,
                      index
                    ) => (
                      <tr
                        key={`${row.contract_item_id}-${row.bidder_name}-${index}`}
                        onClick={() =>
                          openHistoricalBid(
                            row
                          )
                        }
                        title={`Open contract ${row.contract_number} and item ${row.item_number}`}
                        style={{
                          background:
                            row
                              .is_low_bidder
                              ? '#f6fef9'
                              : '#ffffff',

                          cursor:
                            'pointer',
                        }}
                      >
                        <TableCell>
                          {formatDate(
                            row.letting_date
                          )}
                        </TableCell>

                        <TableCell>
                          <strong>
                            {
                              row
                                .contract_number
                            }
                          </strong>
                        </TableCell>

                        <TableCell>
                          {
                            row
                              .project_name ??
                            '—'
                          }
                        </TableCell>

                        <TableCell>
                          {row
                            .counties
                            .join(
                              ', '
                            )}
                        </TableCell>

                        <TableCell>
                          {number(
                            row.quantity
                          )}
                        </TableCell>

                        <TableCell>
                          {
                            row
                              .unit
                          }
                        </TableCell>

                        <TableCell>
                          {
                            row
                              .bidder_name
                          }

                          {row
                            .is_low_bidder && (
                            <WinnerBadge />
                          )}
                        </TableCell>

                        <TableCell>
                          #
                          {
                            row
                              .bidder_rank
                          }
                        </TableCell>

                        <TableCell>
                          <strong>
                            {money(
                              row.unit_price
                            )}
                          </strong>
                        </TableCell>

                        <TableCell>
                          {money(
                            row.extended_amount
                          )}
                        </TableCell>

                        <TableCell>
                          {money(
                            row.bidder_total
                          )}
                        </TableCell>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

// ==========================================
// SORT LABEL
// ==========================================

function SortLabel({
  children,
  active,
  direction,
  onClick,
}: {
  children:
    ReactNode

  active:
    boolean

  direction:
    SortDirection

  onClick:
    () => void
}) {
  return (
    <button
      type="button"
      onClick={
        event => {
          event
            .stopPropagation()

          onClick()
        }
      }
      style={{
        display:
          'inline-flex',

        alignItems:
          'center',

        justifyContent:
          'flex-start',

        gap:
          '6px',

        width:
          '100%',

        border:
          0,

        padding:
          0,

        margin:
          0,

        background:
          'transparent',

        color:
          'inherit',

        font:
          'inherit',

        fontWeight:
          700,

        textAlign:
          'left',

        cursor:
          'pointer',
      }}
    >
      <span>
        {children}
      </span>

      <span
        style={{
          fontSize:
            '9px',

          opacity:
            active
              ? 1
              : 0.35,

          flexShrink:
            0,
        }}
      >
        {active
          ? direction ===
            'asc'
            ? '▲'
            : '▼'
          : '↕'}
      </span>
    </button>
  )
}

// ==========================================
// WINNER BADGE
// ==========================================

function WinnerBadge() {
  return (
    <span
      style={{
        display:
          'inline-block',

        marginLeft:
          '8px',

        background:
          '#dcfae6',

        color:
          '#067647',

        borderRadius:
          '999px',

        padding:
          '2px 7px',

        fontSize:
          '11px',

        fontWeight:
          700,
      }}
    >
      WINNER
    </span>
  )
}

// ==========================================
// STAT CARD
// ==========================================

function StatCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div
      style={{
        ...cardStyle,

        padding:
          '16px',
      }}
    >
      <div
        style={{
          color:
            '#667085',

          fontSize:
            '12px',

          fontWeight:
            600,

          marginBottom:
            '7px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize:
            '20px',

          fontWeight:
            750,

          color:
            '#101828',
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ==========================================
// PRICE BLOCK
// ==========================================

function PriceBlock({
  title,
  stats,
}: {
  title: string
  stats: PriceStats
}) {
  return (
    <div
      style={
        cardStyle
      }
    >
      <h3
        style={{
          marginTop:
            0,

          marginBottom:
            '16px',

          color:
            '#101828',
        }}
      >
        {title}
      </h3>

      <div
        style={{
          display:
            'grid',

          gridTemplateColumns:
            'repeat(3,1fr)',

          gap:
            '14px',
        }}
      >
        <MiniStat
          label="Minimum"
          value={money(
            stats.minimum
          )}
        />

        <MiniStat
          label="25th percentile"
          value={money(
            stats.p25
          )}
        />

        <MiniStat
          label="Median"
          value={money(
            stats.median
          )}
        />

        <MiniStat
          label="Average"
          value={money(
            stats.average
          )}
        />

        <MiniStat
          label="75th percentile"
          value={money(
            stats.p75
          )}
        />

        <MiniStat
          label="Maximum"
          value={money(
            stats.maximum
          )}
        />
      </div>
    </div>
  )
}

// ==========================================
// MINI STAT
// ==========================================

function MiniStat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <div
        style={{
          fontSize:
            '12px',

          color:
            '#667085',

          marginBottom:
            '4px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontWeight:
            700,

          color:
            '#101828',
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ==========================================
// TABLE HEADER
// ==========================================

function TableHeader({
  children,
}: {
  children:
    ReactNode
}) {
  return (
    <th
      style={{
        textAlign:
          'left',

        padding:
          '11px 12px',

        background:
          '#f9fafb',

        borderBottom:
          '1px solid #e4e7ec',

        fontSize:
          '12px',

        color:
          '#475467',

        fontWeight:
          700,

        whiteSpace:
          'nowrap',
      }}
    >
      {children}
    </th>
  )
}

// ==========================================
// TABLE CELL
// ==========================================

function TableCell({
  children,
}: {
  children:
    ReactNode
}) {
  return (
    <td
      style={{
        padding:
          '11px 12px',

        borderBottom:
          '1px solid #eaecf0',

        fontSize:
          '13px',

        color:
          '#344054',

        verticalAlign:
          'top',
      }}
    >
      {children}
    </td>
  )
}

// ==========================================
// STYLES
// ==========================================

const labelStyle:
  CSSProperties =
{
  display:
    'block',

  marginBottom:
    '6px',

  color:
    '#344054',

  fontSize:
    '13px',

  fontWeight:
    650,
}

const inputStyle:
  CSSProperties =
{
  width:
    '100%',

  boxSizing:
    'border-box',

  border:
    '1px solid #d0d5dd',

  borderRadius:
    '8px',

  padding:
    '10px 12px',

  fontSize:
    '14px',

  outline:
    'none',

  background:
    '#ffffff',
}

const cardStyle:
  CSSProperties =
{
  background:
    '#ffffff',

  border:
    '1px solid #e4e7ec',

  borderRadius:
    '12px',

  padding:
    '20px',

  boxShadow:
    '0 1px 3px rgba(16,24,40,.05)',
}

const primaryButtonStyle:
  CSSProperties =
{
  border:
    0,

  borderRadius:
    '8px',

  padding:
    '10px 18px',

  background:
    '#101828',

  color:
    '#ffffff',

  fontWeight:
    700,

  cursor:
    'pointer',
}

const secondaryButtonStyle:
  CSSProperties =
{
  border:
    '1px solid #d0d5dd',

  borderRadius:
    '8px',

  padding:
    '10px 18px',

  background:
    '#ffffff',

  color:
    '#344054',

  fontWeight:
    650,

  cursor:
    'pointer',
}
