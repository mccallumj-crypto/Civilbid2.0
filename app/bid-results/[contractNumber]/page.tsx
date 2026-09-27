'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  useParams,
  useRouter,
  useSearchParams,
} from 'next/navigation'

type Bidder = {
  id: string
  bidder_name: string
  bidder_rank: number
  total_bid: number
  percent_of_low_bid: number | null
  is_low_bidder: boolean
  difference_from_low_bid: number | null
  difference_from_low_bid_percent: number | null
}

type ItemPrice = {
  bidder_id: string
  bidder_name: string
  bidder_rank: number
  is_low_bidder: boolean
  bidder_total: number

  unit_price: number
  extended_amount: number

  item_price_rank: number | null

  difference_vs_winning_item: number | null
  overall_bid_disadvantage: number | null

  bid_disadvantage_impact_percent:
    number | null

  percent_vs_item_median:
    number | null

  percent_of_total_bid:
    number | null
}

type PriceSummary = {
  bidder_count: number

  minimum_unit_price: number | null
  median_unit_price: number | null
  average_unit_price: number | null
  maximum_unit_price: number | null

  minimum_extended_amount: number | null
  median_extended_amount: number | null
  maximum_extended_amount: number | null

  winning_bidder_item_rank:
    number | null

  lowest_item_bidder:
    | {
        bidder_name: string
        bidder_rank: number
        extended_amount: number
      }
    | null
}

type BidItem = {
  id: string

  line_number: string
  item_number: string
  description: string

  quantity: number
  unit: string

  section_number: string | null
  section_description: string | null

  engineer_estimate_unit_price:
    number | null

  price_summary: PriceSummary

  prices: ItemPrice[]
}

type SelectedAnalysis = {
  item_id: string
  item_number: string
  description: string
  quantity: number
  unit: string
  bidder_count: number

  winning_bidder:
    | {
        bidder_name: string
        total_bid: number
      }
    | null

  winning_bidder_item_price:
    | {
        unit_price: number
        extended_amount: number
        item_price_rank: number | null
        rank_out_of: number
        percent_vs_item_median:
          number | null
        percent_of_total_bid:
          number | null
      }
    | null

  lowest_item_bidder:
    | {
        bidder_name: string
        bidder_rank: number
        unit_price: number
        extended_amount: number
        is_contract_winner: boolean
      }
    | null

  price_summary: PriceSummary

  bidder_analysis: ItemPrice[]
}

type ApiResponse = {
  success: boolean

  error?: string

  contract: {
    id: string
    contract_number: string
    project_name: string | null
    letting_date: string | null
    call_order: string | null
    district: string | null
    contract_time: string | null

    counties: string[]

    bidder_count: number
    item_count: number
    price_count: number

    low_bidder:
      | {
          id: string
          bidder_name: string
          bidder_rank: number
          total_bid: number
        }
      | null
  }

  bidders: Bidder[]

  selected_item:
    BidItem | null

  selected_item_analysis:
    SelectedAnalysis | null

  items: BidItem[]
}

type Tab =
  | 'overview'
  | 'schedule'
  | 'analysis'

type SortDirection =
  | 'asc'
  | 'desc'

type OverviewSortKey =
  | 'bidder_rank'
  | 'bidder_name'
  | 'total_bid'
  | 'percent_of_low_bid'
  | 'difference_from_low_bid'
  | 'difference_from_low_bid_percent'

type ScheduleSortKey =
  | 'line_number'
  | 'item_number'
  | 'description'
  | 'quantity'
  | 'unit'
  | `bidder:${string}`

type AnalysisSortKey =
  | 'bidder_rank'
  | 'bidder_name'
  | 'item_price_rank'
  | 'unit_price'
  | 'extended_amount'
  | 'percent_vs_item_median'
  | 'difference_vs_winning_item'
  | 'overall_bid_disadvantage'
  | 'bid_disadvantage_impact_percent'
  | 'percent_of_total_bid'

type SortState<T extends string> = {
  key: T
  direction: SortDirection
}

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

  return new Intl.NumberFormat(
    'en-US',
    {
      style:
        'currency',

      currency:
        'USD',

      maximumFractionDigits:
        2,
    }
  ).format(
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

  return new Intl.NumberFormat(
    'en-US',
    {
      maximumFractionDigits:
        2,
    }
  ).format(
    value
  )
}

function percent(
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

  return `${number(value)}%`
}

function formatDate(
  value:
    | string
    | null
) {
  if (!value) {
    return '—'
  }

  return new Date(
    `${value}T00:00:00`
  ).toLocaleDateString(
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

  let result = 0

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

export default function BidContractPage() {
  const params =
    useParams()

  const router =
    useRouter()

  const searchParams =
    useSearchParams()

  const contractNumber =
    decodeURIComponent(
      String(
        params.contractNumber ??
        ''
      )
    )

  const selectedItemNumber =
    searchParams.get(
      'item'
    ) ?? ''

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
    useState(true)

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null)

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<Tab>(
      selectedItemNumber
        ? 'analysis'
        : 'overview'
    )

  const [
    itemSearch,
    setItemSearch,
  ] =
    useState('')


  const [
    overviewSort,
    setOverviewSort,
  ] =
    useState<
      SortState<OverviewSortKey>
    >({
      key:
        'bidder_rank',

      direction:
        'asc',
    })

  const [
    scheduleSort,
    setScheduleSort,
  ] =
    useState<
      SortState<ScheduleSortKey>
    >({
      key:
        'line_number',

      direction:
        'asc',
    })

  const [
    analysisSort,
    setAnalysisSort,
  ] =
    useState<
      SortState<AnalysisSortKey>
    >({
      key:
        'bidder_rank',

      direction:
        'asc',
    })

  // ========================================
  // LOAD CONTRACT
  // ========================================

  useEffect(
    () => {
      if (
        !contractNumber
      ) {
        return
      }

      async function load() {
        setLoading(
          true
        )

        setError(
          null
        )

        try {
          let url =
            `/api/bid-contracts/${encodeURIComponent(
              contractNumber
            )}`

          if (
            selectedItemNumber
          ) {
            url +=
              `?item=${encodeURIComponent(
                selectedItemNumber
              )}`
          }

          const response =
            await fetch(
              url,
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
              'Contract could not be loaded.'
            )
          }

          setData(
            json
          )

          if (
            selectedItemNumber
          ) {
            setActiveTab(
              'analysis'
            )
          }
        } catch (
          loadError
        ) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : String(
                  loadError
                )
          )
        } finally {
          setLoading(
            false
          )
        }
      }

      load()
    },
    [
      contractNumber,
      selectedItemNumber,
    ]
  )

  // ========================================
  // ITEM FILTER
  // ========================================

  const filteredItems =
    useMemo(
      () => {
        if (
          !data
        ) {
          return []
        }

        const query =
          itemSearch
            .trim()
            .toLowerCase()

        if (!query) {
          return data.items
        }

        return data
          .items
          .filter(
            item =>
              item
                .item_number
                .toLowerCase()
                .includes(
                  query
                ) ||
              item
                .description
                .toLowerCase()
                .includes(
                  query
                ) ||
              item
                .line_number
                .toLowerCase()
                .includes(
                  query
                )
          )
      },
      [
        data,
        itemSearch,
      ]
    )


  const sortedOverviewBidders =
    useMemo(
      () => {
        const bidders =
          data?.bidders ??
          []

        return [
          ...bidders,
        ].sort(
          (
            a,
            b
          ) => {
            return compareSortableValues(
              a[
                overviewSort.key
              ],
              b[
                overviewSort.key
              ],
              overviewSort.direction
            )
          }
        )
      },
      [
        data,
        overviewSort,
      ]
    )

  const sortedScheduleItems =
    useMemo(
      () => {
        return [
          ...filteredItems,
        ].sort(
          (
            a,
            b
          ) => {
            let aValue:
              | string
              | number
              | null
              | undefined

            let bValue:
              | string
              | number
              | null
              | undefined

            if (
              scheduleSort.key
                .startsWith(
                  'bidder:'
                )
            ) {
              const bidderId =
                scheduleSort.key
                  .slice(
                    'bidder:'
                      .length
                  )

              aValue =
                a.prices.find(
                  price =>
                    price.bidder_id ===
                    bidderId
                )
                  ?.unit_price

              bValue =
                b.prices.find(
                  price =>
                    price.bidder_id ===
                    bidderId
                )
                  ?.unit_price
            } else {
              switch (
                scheduleSort.key
              ) {
                case 'line_number':
                  aValue =
                    a.line_number
                  bValue =
                    b.line_number
                  break

                case 'item_number':
                  aValue =
                    a.item_number
                  bValue =
                    b.item_number
                  break

                case 'description':
                  aValue =
                    a.description
                  bValue =
                    b.description
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
              }
            }

            return compareSortableValues(
              aValue,
              bValue,
              scheduleSort.direction
            )
          }
        )
      },
      [
        filteredItems,
        scheduleSort,
      ]
    )

  const sortedAnalysisBidders =
    useMemo(
      () => {
        const bidderAnalysis =
          data
            ?.selected_item_analysis
            ?.bidder_analysis ??
          []

        return [
          ...bidderAnalysis,
        ].sort(
          (
            a,
            b
          ) => {
            return compareSortableValues(
              a[
                analysisSort.key
              ],
              b[
                analysisSort.key
              ],
              analysisSort.direction
            )
          }
        )
      },
      [
        data,
        analysisSort,
      ]
    )

  function toggleOverviewSort(
    key:
      OverviewSortKey
  ) {
    setOverviewSort(
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

  function toggleScheduleSort(
    key:
      ScheduleSortKey
  ) {
    setScheduleSort(
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

  function toggleAnalysisSort(
    key:
      AnalysisSortKey
  ) {
    setAnalysisSort(
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

  function openItem(
    itemNumber:
      string
  ) {
    router.push(
      `/bid-results/${encodeURIComponent(
        contractNumber
      )}?item=${encodeURIComponent(
        itemNumber
      )}`
    )

    setActiveTab(
      'analysis'
    )
  }

  if (
    loading
  ) {
    return (
      <div
        style={{
          padding:
            '32px',
        }}
      >
        Loading contract…
      </div>
    )
  }

  if (
    error
  ) {
    return (
      <div
        style={{
          padding:
            '32px',
        }}
      >
        <div
          style={{
            ...cardStyle,

            color:
              '#b42318',
          }}
        >
          {error}
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const contract =
    data.contract

  const analysis =
    data
      .selected_item_analysis

  return (
    <main
      style={{
        padding:
          '28px 32px',

        background:
          '#f5f6f8',

        minHeight:
          '100vh',
      }}
    >
      <div
        style={{
          maxWidth:
            '1600px',

          margin:
            '0 auto',
        }}
      >
        {/* ============================= */}
        {/* BACK */}
        {/* ============================= */}

        <button
          onClick={() =>
            router.back()
          }
          style={{
            border:
              0,

            background:
              'transparent',

            padding:
              0,

            color:
              '#475467',

            cursor:
              'pointer',

            marginBottom:
              '16px',

            fontWeight:
              650,
          }}
        >
          ← Back
        </button>

        {/* ============================= */}
        {/* HEADER */}
        {/* ============================= */}

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

              gap:
                '24px',

              flexWrap:
                'wrap',
            }}
          >
            <div
              style={{
                maxWidth:
                  '900px',
              }}
            >
              <div
                style={{
                  fontSize:
                    '12px',

                  color:
                    '#667085',

                  fontWeight:
                    700,

                  letterSpacing:
                    '.07em',

                  textTransform:
                    'uppercase',

                  marginBottom:
                    '7px',
                }}
              >
                NJDOT Contract
              </div>

              <h1
                style={{
                  margin:
                    0,

                  color:
                    '#101828',

                  fontSize:
                    '30px',
                }}
              >
                {
                  contract.contract_number
                }
              </h1>

              <div
                style={{
                  marginTop:
                    '5px',

                  fontSize:
                    '18px',

                  fontWeight:
                    650,

                  color:
                    '#344054',
                }}
              >
                {
                  contract.project_name
                }
              </div>

              <div
                style={{
                  display:
                    'flex',

                  gap:
                    '18px',

                  flexWrap:
                    'wrap',

                  marginTop:
                    '14px',

                  color:
                    '#667085',

                  fontSize:
                    '13px',
                }}
              >
                <span>
                  Letting:{' '}
                  <strong>
                    {formatDate(
                      contract.letting_date
                    )}
                  </strong>
                </span>

                <span>
                  District:{' '}
                  <strong>
                    {
                      contract.district ??
                      '—'
                    }
                  </strong>
                </span>

                <span>
                  Call:{' '}
                  <strong>
                    {
                      contract.call_order ??
                      '—'
                    }
                  </strong>
                </span>

                <span>
                  Counties:{' '}
                  <strong>
                    {contract
                      .counties
                      .join(
                        ', '
                      )}
                  </strong>
                </span>
              </div>
            </div>

            <div
              style={{
                minWidth:
                  '280px',

                background:
                  '#f8fafc',

                borderRadius:
                  '10px',

                padding:
                  '16px',
              }}
            >
              <div
                style={{
                  fontSize:
                    '12px',

                  color:
                    '#667085',

                  marginBottom:
                    '5px',
                }}
              >
                Winning bidder
              </div>

              <div
                style={{
                  fontWeight:
                    750,

                  color:
                    '#101828',
                }}
              >
                {contract
                  .low_bidder
                  ?.bidder_name ??
                  '—'}
              </div>

              <div
                style={{
                  fontSize:
                    '22px',

                  fontWeight:
                    800,

                  marginTop:
                    '5px',

                  color:
                    '#101828',
                }}
              >
                {money(
                  contract
                    .low_bidder
                    ?.total_bid
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ============================= */}
        {/* CONTRACT STATS */}
        {/* ============================= */}

        <div
          style={{
            display:
              'grid',

            gridTemplateColumns:
              'repeat(4, minmax(150px,1fr))',

            gap:
              '12px',

            marginBottom:
              '18px',
          }}
        >
          <StatCard
            label="Bidders"
            value={number(
              contract.bidder_count
            )}
          />

          <StatCard
            label="Pay items"
            value={number(
              contract.item_count
            )}
          />

          <StatCard
            label="Price records"
            value={number(
              contract.price_count
            )}
          />

          <StatCard
            label="Contract time"
            value={
              contract.contract_time ??
              '—'
            }
          />
        </div>

        {/* ============================= */}
        {/* TABS */}
        {/* ============================= */}

        <div
          style={{
            display:
              'flex',

            gap:
              '6px',

            marginBottom:
              '18px',
          }}
        >
          <TabButton
            active={
              activeTab ===
              'overview'
            }
            onClick={() =>
              setActiveTab(
                'overview'
              )
            }
          >
            Overview
          </TabButton>

          <TabButton
            active={
              activeTab ===
              'schedule'
            }
            onClick={() =>
              setActiveTab(
                'schedule'
              )
            }
          >
            Bid Schedule
          </TabButton>

          <TabButton
            active={
              activeTab ===
              'analysis'
            }
            onClick={() =>
              setActiveTab(
                'analysis'
              )
            }
          >
            Item Analysis
          </TabButton>
        </div>

        {/* ============================= */}
        {/* OVERVIEW */}
        {/* ============================= */}

        {activeTab ===
          'overview' && (
          <div
            style={
              cardStyle
            }
          >
            <h2
              style={
                headingStyle
              }
            >
              Bidder Results
            </h2>

            <div
              style={{
                overflowX:
                  'auto',
              }}
            >
              <table
                style={
                  tableStyle
                }
              >
                <thead>
                  <tr>
                    <TH>
                      <SortLabel
                        active={
                          overviewSort.key ===
                          'bidder_rank'
                        }
                        direction={
                          overviewSort.direction
                        }
                        onClick={() =>
                          toggleOverviewSort(
                            'bidder_rank'
                          )
                        }
                      >
                        Rank
                      </SortLabel>
                    </TH>

                    <TH>
                      <SortLabel
                        active={
                          overviewSort.key ===
                          'bidder_name'
                        }
                        direction={
                          overviewSort.direction
                        }
                        onClick={() =>
                          toggleOverviewSort(
                            'bidder_name'
                          )
                        }
                      >
                        Bidder
                      </SortLabel>
                    </TH>

                    <TH>
                      <SortLabel
                        active={
                          overviewSort.key ===
                          'total_bid'
                        }
                        direction={
                          overviewSort.direction
                        }
                        onClick={() =>
                          toggleOverviewSort(
                            'total_bid'
                          )
                        }
                      >
                        Total Bid
                      </SortLabel>
                    </TH>

                    <TH>
                      <SortLabel
                        active={
                          overviewSort.key ===
                          'percent_of_low_bid'
                        }
                        direction={
                          overviewSort.direction
                        }
                        onClick={() =>
                          toggleOverviewSort(
                            'percent_of_low_bid'
                          )
                        }
                      >
                        % of Low
                      </SortLabel>
                    </TH>

                    <TH>
                      <SortLabel
                        active={
                          overviewSort.key ===
                          'difference_from_low_bid'
                        }
                        direction={
                          overviewSort.direction
                        }
                        onClick={() =>
                          toggleOverviewSort(
                            'difference_from_low_bid'
                          )
                        }
                      >
                        Difference
                      </SortLabel>
                    </TH>

                    <TH>
                      <SortLabel
                        active={
                          overviewSort.key ===
                          'difference_from_low_bid_percent'
                        }
                        direction={
                          overviewSort.direction
                        }
                        onClick={() =>
                          toggleOverviewSort(
                            'difference_from_low_bid_percent'
                          )
                        }
                      >
                        Difference %
                      </SortLabel>
                    </TH>
                  </tr>
                </thead>

                <tbody>
                  {sortedOverviewBidders
                    .map(
                      bidder => (
                        <tr
                          key={
                            bidder.id
                          }
                          style={{
                            background:
                              bidder
                                .is_low_bidder
                                ? '#f6fef9'
                                : undefined,
                          }}
                        >
                          <TD>
                            #
                            {
                              bidder.bidder_rank
                            }
                          </TD>

                          <TD>
                            <strong>
                              {
                                bidder.bidder_name
                              }
                            </strong>

                            {bidder
                              .is_low_bidder && (
                              <WinnerBadge />
                            )}
                          </TD>

                          <TD>
                            <strong>
                              {money(
                                bidder.total_bid
                              )}
                            </strong>
                          </TD>

                          <TD>
                            {percent(
                              bidder.percent_of_low_bid
                            )}
                          </TD>

                          <TD>
                            {bidder
                              .is_low_bidder
                              ? '—'
                              : money(
                                  bidder.difference_from_low_bid
                                )}
                          </TD>

                          <TD>
                            {bidder
                              .is_low_bidder
                              ? '—'
                              : percent(
                                  bidder.difference_from_low_bid_percent
                                )}
                          </TD>
                        </tr>
                      )
                    )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================= */}
        {/* BID SCHEDULE */}
        {/* ============================= */}

        {activeTab ===
          'schedule' && (
          <>
            <div
              style={{
                ...cardStyle,

                marginBottom:
                  '14px',
              }}
            >
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
                <div>
                  <h2
                    style={{
                      ...headingStyle,

                      marginBottom:
                        '4px',
                    }}
                  >
                    Complete Bid
                    Schedule
                  </h2>

                  <div
                    style={{
                      color:
                        '#667085',

                      fontSize:
                        '13px',
                    }}
                  >
                    Click any item
                    for detailed
                    competitive
                    analysis.
                  </div>
                </div>

                <input
                  value={
                    itemSearch
                  }
                  onChange={
                    event =>
                      setItemSearch(
                        event
                          .target
                          .value
                      )
                  }
                  placeholder="Search item number or description"
                  style={{
                    width:
                      '320px',

                    maxWidth:
                      '100%',

                    border:
                      '1px solid #d0d5dd',

                    borderRadius:
                      '8px',

                    padding:
                      '10px 12px',

                    fontSize:
                      '14px',
                  }}
                />
              </div>
            </div>

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
                  overflow:
                    'auto',

                  maxHeight:
                    '72vh',
                }}
              >
                <table
                  style={{
                    borderCollapse:
                      'separate',

                    borderSpacing:
                      0,

                    minWidth:
                      `${800 +
                        data
                          .bidders
                          .length *
                          150}px`,

                    width:
                      '100%',
                  }}
                >
                  <thead>
                    <tr>
                      <StickyTH
                        left={0}
                        width={65}
                      >
                        <SortLabel
                          compact
                          active={
                            scheduleSort.key ===
                            'line_number'
                          }
                          direction={
                            scheduleSort.direction
                          }
                          onClick={() =>
                            toggleScheduleSort(
                              'line_number'
                            )
                          }
                        >
                          Line
                        </SortLabel>
                      </StickyTH>

                      <StickyTH
                        left={65}
                        width={115}
                      >
                        <SortLabel
                          compact
                          active={
                            scheduleSort.key ===
                            'item_number'
                          }
                          direction={
                            scheduleSort.direction
                          }
                          onClick={() =>
                            toggleScheduleSort(
                              'item_number'
                            )
                          }
                        >
                          Item
                        </SortLabel>
                      </StickyTH>

                      <StickyTH
                        left={180}
                        width={300}
                      >
                        <SortLabel
                          compact
                          active={
                            scheduleSort.key ===
                            'description'
                          }
                          direction={
                            scheduleSort.direction
                          }
                          onClick={() =>
                            toggleScheduleSort(
                              'description'
                            )
                          }
                        >
                          Description
                        </SortLabel>
                      </StickyTH>

                      <StickyTH
                        left={480}
                        width={85}
                      >
                        <SortLabel
                          compact
                          active={
                            scheduleSort.key ===
                            'quantity'
                          }
                          direction={
                            scheduleSort.direction
                          }
                          onClick={() =>
                            toggleScheduleSort(
                              'quantity'
                            )
                          }
                        >
                          Qty
                        </SortLabel>
                      </StickyTH>

                      <StickyTH
                        left={565}
                        width={70}
                      >
                        <SortLabel
                          compact
                          active={
                            scheduleSort.key ===
                            'unit'
                          }
                          direction={
                            scheduleSort.direction
                          }
                          onClick={() =>
                            toggleScheduleSort(
                              'unit'
                            )
                          }
                        >
                          Unit
                        </SortLabel>
                      </StickyTH>

                      {data
                        .bidders
                        .map(
                          bidder => (
                            <th
                              key={
                                bidder.id
                              }
                              style={{
                                ...scheduleHeaderStyle,

                                minWidth:
                                  '150px',

                                background:
                                  bidder
                                    .is_low_bidder
                                    ? '#ecfdf3'
                                    : '#f9fafb',
                              }}
                            >
                              <SortLabel
                                compact
                                active={
                                  scheduleSort.key ===
                                  `bidder:${bidder.id}`
                                }
                                direction={
                                  scheduleSort.direction
                                }
                                onClick={() =>
                                  toggleScheduleSort(
                                    `bidder:${bidder.id}`
                                  )
                                }
                              >
                                <span>
                                  #
                                  {
                                    bidder.bidder_rank
                                  }
                                  {' '}
                                  {
                                    bidder.bidder_name
                                  }
                                </span>
                              </SortLabel>
                            </th>
                          )
                        )}
                    </tr>
                  </thead>

                  <tbody>
                    {sortedScheduleItems.map(
                      item => {
                        const priceMap =
                          new Map(
                            item
                              .prices
                              .map(
                                price => [
                                  price.bidder_id,
                                  price,
                                ]
                              )
                          )

                        const selected =
                          selectedItemNumber ===
                          item.item_number

                        return (
                          <tr
                            key={
                              item.id
                            }
                            onClick={() =>
                              openItem(
                                item.item_number
                              )
                            }
                            style={{
                              cursor:
                                'pointer',

                              background:
                                selected
                                  ? '#fffaeb'
                                  : '#ffffff',
                            }}
                          >
                            <StickyTD
                              left={0}
                              width={65}
                              selected={
                                selected
                              }
                            >
                              {
                                item.line_number
                              }
                            </StickyTD>

                            <StickyTD
                              left={65}
                              width={115}
                              selected={
                                selected
                              }
                            >
                              <strong>
                                {
                                  item.item_number
                                }
                              </strong>
                            </StickyTD>

                            <StickyTD
                              left={180}
                              width={300}
                              selected={
                                selected
                              }
                            >
                              {
                                item.description
                              }
                            </StickyTD>

                            <StickyTD
                              left={480}
                              width={85}
                              selected={
                                selected
                              }
                            >
                              {number(
                                item.quantity
                              )}
                            </StickyTD>

                            <StickyTD
                              left={565}
                              width={70}
                              selected={
                                selected
                              }
                            >
                              {
                                item.unit
                              }
                            </StickyTD>

                            {data
                              .bidders
                              .map(
                                bidder => {
                                  const price =
                                    priceMap.get(
                                      bidder.id
                                    )

                                  return (
                                    <td
                                      key={
                                        bidder.id
                                      }
                                      style={{
                                        padding:
                                          '9px 10px',

                                        borderBottom:
                                          '1px solid #eaecf0',

                                        borderRight:
                                          '1px solid #f0f1f3',

                                        minWidth:
                                          '150px',

                                        background:
                                          bidder
                                            .is_low_bidder
                                            ? '#f6fef9'
                                            : selected
                                              ? '#fffaeb'
                                              : '#ffffff',

                                        verticalAlign:
                                          'top',
                                      }}
                                    >
                                      {price ? (
                                        <>
                                          <div
                                            style={{
                                              fontWeight:
                                                700,

                                              color:
                                                '#101828',
                                            }}
                                          >
                                            {money(
                                              price.unit_price
                                            )}
                                          </div>

                                          <div
                                            style={{
                                              color:
                                                '#667085',

                                              fontSize:
                                                '11px',

                                              marginTop:
                                                '3px',
                                            }}
                                          >
                                            Ext.{' '}
                                            {money(
                                              price.extended_amount
                                            )}
                                          </div>

                                          <div
                                            style={{
                                              color:
                                                '#667085',

                                              fontSize:
                                                '11px',

                                              marginTop:
                                                '2px',
                                            }}
                                          >
                                            Item rank #
                                            {
                                              price.item_price_rank
                                            }
                                          </div>
                                        </>
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                  )
                                }
                              )}
                          </tr>
                        )
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ============================= */}
        {/* ITEM ANALYSIS */}
        {/* ============================= */}

        {activeTab ===
          'analysis' && (
          <>
            {!analysis ? (
              <div
                style={
                  cardStyle
                }
              >
                <h2
                  style={
                    headingStyle
                  }
                >
                  Select an item
                </h2>

                <p
                  style={{
                    color:
                      '#667085',

                    marginBottom:
                      '14px',
                  }}
                >
                  Open the Bid
                  Schedule and click
                  any pay item to
                  analyze how every
                  bidder priced it.
                </p>

                <button
                  onClick={() =>
                    setActiveTab(
                      'schedule'
                    )
                  }
                  style={
                    primaryButtonStyle
                  }
                >
                  Open Bid Schedule
                </button>
              </div>
            ) : (
              <>
                {/* ITEM HEADER */}

                <div
                  style={{
                    ...cardStyle,

                    marginBottom:
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
                        700,

                      textTransform:
                        'uppercase',

                      letterSpacing:
                        '.06em',
                    }}
                  >
                    Selected Item
                  </div>

                  <div
                    style={{
                      display:
                        'flex',

                      justifyContent:
                        'space-between',

                      gap:
                        '20px',

                      flexWrap:
                        'wrap',

                      marginTop:
                        '7px',
                    }}
                  >
                    <div>
                      <h2
                        style={{
                          margin:
                            0,

                          fontSize:
                            '25px',

                          color:
                            '#101828',
                        }}
                      >
                        {
                          analysis.item_number
                        }
                      </h2>

                      <div
                        style={{
                          marginTop:
                            '4px',

                          color:
                            '#344054',

                          fontWeight:
                            650,
                        }}
                      >
                        {
                          analysis.description
                        }
                      </div>

                      <div
                        style={{
                          marginTop:
                            '8px',

                          color:
                            '#667085',

                          fontSize:
                            '13px',
                        }}
                      >
                        Qty{' '}
                        <strong>
                          {number(
                            analysis.quantity
                          )}
                        </strong>

                        {' · '}

                        Unit{' '}
                        <strong>
                          {
                            analysis.unit
                          }
                        </strong>

                        {' · '}

                        {
                          analysis.bidder_count
                        }{' '}
                        bidders
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        setActiveTab(
                          'schedule'
                        )
                      }
                      style={
                        secondaryButtonStyle
                      }
                    >
                      View in Bid
                      Schedule
                    </button>
                  </div>
                </div>

                {/* ITEM STATS */}

                <div
                  style={{
                    display:
                      'grid',

                    gridTemplateColumns:
                      'repeat(5, minmax(150px,1fr))',

                    gap:
                      '12px',

                    marginBottom:
                      '16px',
                  }}
                >
                  <StatCard
                    label="Low"
                    value={money(
                      analysis
                        .price_summary
                        .minimum_unit_price
                    )}
                  />

                  <StatCard
                    label="Median"
                    value={money(
                      analysis
                        .price_summary
                        .median_unit_price
                    )}
                  />

                  <StatCard
                    label="Average"
                    value={money(
                      analysis
                        .price_summary
                        .average_unit_price
                    )}
                  />

                  <StatCard
                    label="High"
                    value={money(
                      analysis
                        .price_summary
                        .maximum_unit_price
                    )}
                  />

                  <StatCard
                    label="Winner Item Rank"
                    value={
                      analysis
                        .winning_bidder_item_price
                        ?.item_price_rank
                        ? `#${
                            analysis
                              .winning_bidder_item_price
                              .item_price_rank
                          } of ${
                            analysis
                              .winning_bidder_item_price
                              .rank_out_of
                          }`
                        : '—'
                    }
                  />
                </div>

                {/* WINNING BID ANALYSIS */}

                {analysis
                  .winning_bidder_item_price && (
                  <div
                    style={{
                      ...cardStyle,

                      marginBottom:
                        '16px',

                      border:
                        '1px solid #abefc6',

                      background:
                        '#f6fef9',
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          '13px',

                        fontWeight:
                          700,

                        color:
                          '#067647',

                        marginBottom:
                          '8px',
                      }}
                    >
                      WINNING BIDDER
                      ANALYSIS
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
                      {
                        analysis
                          .winning_bidder
                          ?.bidder_name
                      }
                    </div>

                    <div
                      style={{
                        marginTop:
                          '8px',

                        color:
                          '#344054',

                        lineHeight:
                          1.65,
                      }}
                    >
                      Priced this item
                      at{' '}
                      <strong>
                        {money(
                          analysis
                            .winning_bidder_item_price
                            .unit_price
                        )}
                      </strong>

                      {' and ranked '}

                      <strong>
                        #
                        {
                          analysis
                            .winning_bidder_item_price
                            .item_price_rank
                        }{' '}
                        of{' '}
                        {
                          analysis
                            .winning_bidder_item_price
                            .rank_out_of
                        }
                      </strong>

                      {' on the item. '}

                      {analysis
                        .winning_bidder_item_price
                        .percent_vs_item_median !==
                        null && (
                        <>
                          Its price was{' '}
                          <strong>
                            {Math.abs(
                              analysis
                                .winning_bidder_item_price
                                .percent_vs_item_median
                            )}
                            %
                          </strong>{' '}
                          {analysis
                            .winning_bidder_item_price
                            .percent_vs_item_median <
                          0
                            ? 'below'
                            : 'above'}{' '}
                          the bidder
                          median.
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* BIDDER ANALYSIS TABLE */}

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
                        ...headingStyle,

                        margin:
                          0,
                      }}
                    >
                      Bidder Item
                      Comparison
                    </h2>
                  </div>

                  <div
                    style={{
                      overflowX:
                        'auto',
                    }}
                  >
                    <table
                      style={{
                        ...tableStyle,

                        minWidth:
                          '1300px',
                      }}
                    >
                      <thead>
                        <tr>
                          <TH>
                            <SortLabel
                              active={
                                analysisSort.key ===
                                'bidder_rank'
                              }
                              direction={
                                analysisSort.direction
                              }
                              onClick={() =>
                                toggleAnalysisSort(
                                  'bidder_rank'
                                )
                              }
                            >
                              Overall Rank
                            </SortLabel>
                          </TH>

                          <TH>
                            <SortLabel
                              active={
                                analysisSort.key ===
                                'bidder_name'
                              }
                              direction={
                                analysisSort.direction
                              }
                              onClick={() =>
                                toggleAnalysisSort(
                                  'bidder_name'
                                )
                              }
                            >
                              Bidder
                            </SortLabel>
                          </TH>

                          <TH>
                            <SortLabel
                              active={
                                analysisSort.key ===
                                'item_price_rank'
                              }
                              direction={
                                analysisSort.direction
                              }
                              onClick={() =>
                                toggleAnalysisSort(
                                  'item_price_rank'
                                )
                              }
                            >
                              Item Rank
                            </SortLabel>
                          </TH>

                          <TH>
                            <SortLabel
                              active={
                                analysisSort.key ===
                                'unit_price'
                              }
                              direction={
                                analysisSort.direction
                              }
                              onClick={() =>
                                toggleAnalysisSort(
                                  'unit_price'
                                )
                              }
                            >
                              Unit Price
                            </SortLabel>
                          </TH>

                          <TH>
                            <SortLabel
                              active={
                                analysisSort.key ===
                                'extended_amount'
                              }
                              direction={
                                analysisSort.direction
                              }
                              onClick={() =>
                                toggleAnalysisSort(
                                  'extended_amount'
                                )
                              }
                            >
                              Extension
                            </SortLabel>
                          </TH>

                          <TH>
                            <SortLabel
                              active={
                                analysisSort.key ===
                                'percent_vs_item_median'
                              }
                              direction={
                                analysisSort.direction
                              }
                              onClick={() =>
                                toggleAnalysisSort(
                                  'percent_vs_item_median'
                                )
                              }
                            >
                              vs. Median
                            </SortLabel>
                          </TH>

                          <TH>
                            <SortLabel
                              active={
                                analysisSort.key ===
                                'difference_vs_winning_item'
                              }
                              direction={
                                analysisSort.direction
                              }
                              onClick={() =>
                                toggleAnalysisSort(
                                  'difference_vs_winning_item'
                                )
                              }
                            >
                              vs. Winner Item
                            </SortLabel>
                          </TH>

                          <TH>
                            <SortLabel
                              active={
                                analysisSort.key ===
                                'overall_bid_disadvantage'
                              }
                              direction={
                                analysisSort.direction
                              }
                              onClick={() =>
                                toggleAnalysisSort(
                                  'overall_bid_disadvantage'
                                )
                              }
                            >
                              Overall Bid Gap
                            </SortLabel>
                          </TH>

                          <TH>
                            <SortLabel
                              active={
                                analysisSort.key ===
                                'bid_disadvantage_impact_percent'
                              }
                              direction={
                                analysisSort.direction
                              }
                              onClick={() =>
                                toggleAnalysisSort(
                                  'bid_disadvantage_impact_percent'
                                )
                              }
                            >
                              Item Impact
                            </SortLabel>
                          </TH>

                          <TH>
                            <SortLabel
                              active={
                                analysisSort.key ===
                                'percent_of_total_bid'
                              }
                              direction={
                                analysisSort.direction
                              }
                              onClick={() =>
                                toggleAnalysisSort(
                                  'percent_of_total_bid'
                                )
                              }
                            >
                              % of Total Bid
                            </SortLabel>
                          </TH>
                        </tr>
                      </thead>

                      <tbody>
                        {sortedAnalysisBidders
                          .map(
                            price => (
                              <tr
                                key={
                                  price.bidder_id
                                }
                                style={{
                                  background:
                                    price
                                      .is_low_bidder
                                      ? '#f6fef9'
                                      : undefined,
                                }}
                              >
                                <TD>
                                  #
                                  {
                                    price.bidder_rank
                                  }
                                </TD>

                                <TD>
                                  <strong>
                                    {
                                      price.bidder_name
                                    }
                                  </strong>

                                  {price
                                    .is_low_bidder && (
                                    <WinnerBadge />
                                  )}
                                </TD>

                                <TD>
                                  #
                                  {
                                    price.item_price_rank
                                  }
                                </TD>

                                <TD>
                                  <strong>
                                    {money(
                                      price.unit_price
                                    )}
                                  </strong>
                                </TD>

                                <TD>
                                  {money(
                                    price.extended_amount
                                  )}
                                </TD>

                                <TD>
                                  <VarianceText
                                    value={
                                      price.percent_vs_item_median
                                    }
                                  />
                                </TD>

                                <TD>
                                  <DifferenceText
                                    value={
                                      price.difference_vs_winning_item
                                    }
                                  />
                                </TD>

                                <TD>
                                  {price
                                    .is_low_bidder
                                    ? '—'
                                    : money(
                                        price.overall_bid_disadvantage
                                      )}
                                </TD>

                                <TD>
                                  <ImpactCell
                                    price={
                                      price
                                    }
                                  />
                                </TD>

                                <TD>
                                  {percent(
                                    price.percent_of_total_bid
                                  )}
                                </TD>
                              </tr>
                            )
                          )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}

// ==========================================
// COMPONENTS
// ==========================================

function SortLabel({
  children,
  active,
  direction,
  onClick,
  compact = false,
}: {
  children:
    React.ReactNode

  active:
    boolean

  direction:
    SortDirection

  onClick:
    () => void

  compact?:
    boolean
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
          compact
            ? 'flex-start'
            : 'center',

        justifyContent:
          'flex-start',

        gap:
          '5px',

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

        whiteSpace:
          compact
            ? 'normal'
            : 'nowrap',

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

          marginTop:
            compact
              ? '1px'
              : 0,
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

function ImpactCell({
  price,
}: {
  price: ItemPrice
}) {
  const impact =
    price
      .bid_disadvantage_impact_percent

  if (
    price.is_low_bidder ||
    impact === null
  ) {
    return (
      <span>
        —
      </span>
    )
  }

  if (
    impact > 0
  ) {
    return (
      <div>
        <div
          style={{
            fontWeight:
              700,

            color:
              '#b42318',
          }}
        >
          +{number(
            impact
          )}
          %
        </div>

        <div
          style={{
            fontSize:
              '11px',

            color:
              '#667085',

            marginTop:
              '2px',
          }}
        >
          Added to bid gap
        </div>
      </div>
    )
  }

  if (
    impact < 0
  ) {
    return (
      <div>
        <div
          style={{
            fontWeight:
              700,

            color:
              '#067647',
          }}
        >
          {number(
            Math.abs(
              impact
            )
          )}
          %
        </div>

        <div
          style={{
            fontSize:
              '11px',

            color:
              '#667085',

            marginTop:
              '2px',
          }}
        >
          Offset bid gap
        </div>
      </div>
    )
  }

  return (
    <span>
      0%
    </span>
  )
}

function DifferenceText({
  value,
}: {
  value:
    | number
    | null
}) {
  if (
    value === null
  ) {
    return (
      <span>
        —
      </span>
    )
  }

  if (
    value > 0
  ) {
    return (
      <span
        style={{
          color:
            '#b42318',

          fontWeight:
            650,
        }}
      >
        +{money(
          value
        )}
      </span>
    )
  }

  if (
    value < 0
  ) {
    return (
      <span
        style={{
          color:
            '#067647',

          fontWeight:
            650,
        }}
      >
        -{money(
          Math.abs(
            value
          )
        )}
      </span>
    )
  }

  return (
    <span>
      $0
    </span>
  )
}

function VarianceText({
  value,
}: {
  value:
    | number
    | null
}) {
  if (
    value === null
  ) {
    return (
      <span>
        —
      </span>
    )
  }

  if (
    value > 0
  ) {
    return (
      <span
        style={{
          color:
            '#b42318',
        }}
      >
        +{number(
          value
        )}
        %
      </span>
    )
  }

  if (
    value < 0
  ) {
    return (
      <span
        style={{
          color:
            '#067647',
        }}
      >
        {number(
          value
        )}
        %
      </span>
    )
  }

  return (
    <span>
      0%
    </span>
  )
}

function WinnerBadge() {
  return (
    <span
      style={{
        display:
          'inline-block',

        marginLeft:
          '7px',

        padding:
          '2px 7px',

        borderRadius:
          '999px',

        background:
          '#dcfae6',

        color:
          '#067647',

        fontSize:
          '10px',

        fontWeight:
          750,
      }}
    >
      WINNER
    </span>
  )
}

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
          '15px',
      }}
    >
      <div
        style={{
          color:
            '#667085',

          fontSize:
            '12px',

          marginBottom:
            '5px',
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize:
            '18px',

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

function TabButton({
  children,
  active,
  onClick,
}: {
  children:
    React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={
        onClick
      }
      style={{
        border:
          active
            ? '1px solid #101828'
            : '1px solid #d0d5dd',

        background:
          active
            ? '#101828'
            : '#ffffff',

        color:
          active
            ? '#ffffff'
            : '#344054',

        borderRadius:
          '8px',

        padding:
          '9px 15px',

        fontWeight:
          700,

        cursor:
          'pointer',
      }}
    >
      {children}
    </button>
  )
}

function TH({
  children,
}: {
  children:
    React.ReactNode
}) {
  return (
    <th
      style={{
        textAlign:
          'left',

        padding:
          '11px 12px',

        borderBottom:
          '1px solid #e4e7ec',

        background:
          '#f9fafb',

        color:
          '#475467',

        fontSize:
          '12px',

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

function TD({
  children,
}: {
  children:
    React.ReactNode
}) {
  return (
    <td
      style={{
        padding:
          '11px 12px',

        borderBottom:
          '1px solid #eaecf0',

        color:
          '#344054',

        fontSize:
          '13px',

        verticalAlign:
          'top',
      }}
    >
      {children}
    </td>
  )
}

function StickyTH({
  children,
  left,
  width,
}: {
  children:
    React.ReactNode
  left: number
  width: number
}) {
  return (
    <th
      style={{
        ...scheduleHeaderStyle,

        position:
          'sticky',

        left,

        top:
          0,

        zIndex:
          5,

        width,
        minWidth:
          width,

        maxWidth:
          width,

        background:
          '#f9fafb',

        boxShadow:
          '1px 0 0 #e4e7ec',
      }}
    >
      {children}
    </th>
  )
}

function StickyTD({
  children,
  left,
  width,
  selected,
}: {
  children:
    React.ReactNode
  left: number
  width: number
  selected: boolean
}) {
  return (
    <td
      style={{
        position:
          'sticky',

        left,

        zIndex:
          2,

        width,
        minWidth:
          width,

        maxWidth:
          width,

        padding:
          '9px 10px',

        borderBottom:
          '1px solid #eaecf0',

        background:
          selected
            ? '#fffaeb'
            : '#ffffff',

        boxShadow:
          '1px 0 0 #e4e7ec',

        color:
          '#344054',

        fontSize:
          '12px',

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

const cardStyle:
  React.CSSProperties =
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

const headingStyle:
  React.CSSProperties =
{
  marginTop:
    0,

  marginBottom:
    '16px',

  fontSize:
    '19px',

  color:
    '#101828',
}

const tableStyle:
  React.CSSProperties =
{
  width:
    '100%',

  borderCollapse:
    'collapse',
}

const scheduleHeaderStyle:
  React.CSSProperties =
{
  textAlign:
    'left',

  padding:
    '9px 10px',

  borderBottom:
    '1px solid #d0d5dd',

  borderRight:
    '1px solid #e4e7ec',

  color:
    '#475467',

  fontSize:
    '11px',

  fontWeight:
    700,

  verticalAlign:
    'top',

  position:
    'sticky',

  top:
    0,

  zIndex:
    3,
}

const primaryButtonStyle:
  React.CSSProperties =
{
  border:
    0,

  borderRadius:
    '8px',

  padding:
    '10px 16px',

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
  React.CSSProperties =
{
  border:
    '1px solid #d0d5dd',

  borderRadius:
    '8px',

  padding:
    '10px 16px',

  background:
    '#ffffff',

  color:
    '#344054',

  fontWeight:
    650,

  cursor:
    'pointer',
}
