import type { Order, OrderWithMetrics, DashboardStats } from './types'

export function calcTotalCosts(order: Order): number {
  return (
    order.product_cost +
    order.packaging_cost +
    order.delivery_cost +
    order.call_center_cost +
    order.ad_spend
  )
}

export function calcGrossProfit(order: Order): number {
  return order.selling_price - order.product_cost - order.packaging_cost
}

// Profit brut = CA - tous les coûts opérationnels SAUF la pub
export function calcBrutProfit(order: Order): number {
  return order.selling_price - order.product_cost - order.packaging_cost - order.delivery_cost - order.call_center_cost
}

export function calcNetProfit(order: Order): number {
  return order.selling_price - calcTotalCosts(order)
}

export function calcCommission(netProfit: number, commissionRate: number): number {
  if (netProfit <= 0) return 0
  return netProfit * (commissionRate / 100)
}

export function enrichOrder(order: Order, commissionRate = 10): OrderWithMetrics {
  const totalCosts = calcTotalCosts(order)
  const grossProfit = calcGrossProfit(order)
  const netProfit = calcNetProfit(order)
  const commission = calcCommission(netProfit, commissionRate)
  return { ...order, total_costs: totalCosts, gross_profit: grossProfit, net_profit: netProfit, commission }
}

// Statuses that count as "processed" (call center made a decision)
const PROCESSED_STATUSES = ['confirmed', 'delivered', 'returned', 'cancelled', 'wrong_number', 'no_reply', 'unreachable', 'out_of_stock', 'duplicate']
const CONFIRMED_STATUSES = ['confirmed', 'delivered', 'returned']

export function calcStats(orders: Order[]): DashboardStats {
  const delivered    = orders.filter(o => o.status === 'delivered')
  const confirmed    = orders.filter(o => CONFIRMED_STATUSES.includes(o.status))
  const processed    = orders.filter(o => PROCESSED_STATUSES.includes(o.status))
  const returned     = orders.filter(o => o.status === 'returned')
  const cancelled    = orders.filter(o => o.status === 'cancelled')

  const totalRevenue    = delivered.reduce((s, o) => s + o.selling_price, 0)
  const totalNetProfit  = delivered.reduce((s, o) => s + calcNetProfit(o), 0)
  const totalAdSpend    = orders.reduce((s, o) => s + o.ad_spend, 0)

  const confirmationRate = processed.length > 0 ? (confirmed.length / processed.length) * 100 : 0
  const deliveryRate     = confirmed.length > 0 ? (delivered.length / confirmed.length) * 100 : 0
  const returnRate       = confirmed.length > 0 ? (returned.length / confirmed.length) * 100 : 0
  const roi              = totalAdSpend > 0 ? ((totalNetProfit / totalAdSpend) * 100) : 0

  return {
    totalRevenue,
    totalNetProfit,
    totalOrders:    orders.length,
    totalLeads:     orders.filter(o => o.status === 'lead').length,
    totalConfirmed: confirmed.length,
    totalDelivered: delivered.length,
    totalReturned:  returned.length,
    totalCancelled: cancelled.length,
    totalAdSpend,
    confirmationRate,
    deliveryRate,
    returnRate,
    roi,
  }
}
