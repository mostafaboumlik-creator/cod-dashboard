import { Badge } from './ui/badge'
import type { OrderStatus } from '@/lib/types'

const STATUS_CONFIG: Record<OrderStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }> = {
  lead:                { label: 'Lead',              variant: 'default'  },
  confirmed:           { label: 'Confirmé',          variant: 'info'     },
  picked_up:           { label: 'Ramassé',           variant: 'info'     },
  received_hub:        { label: 'Reçu agence',       variant: 'info'     },
  address_issue:       { label: 'Attente adresse',   variant: 'warning'  },
  in_delivery:         { label: 'En livraison',      variant: 'info'     },
  out_of_zone:         { label: 'Hors-zone',         variant: 'warning'  },
  refused:             { label: 'Refusé',            variant: 'danger'   },
  preparing_return:    { label: 'Prép. retour',      variant: 'warning'  },
  redirect_city:       { label: 'Renvoi ville',      variant: 'warning'  },
  delivered:           { label: 'Livré',             variant: 'success'  },
  returned:            { label: 'Retour',            variant: 'warning'  },
  cancelled:           { label: 'Annulé',            variant: 'danger'   },
  wrong_number:        { label: 'Faux numéro',       variant: 'danger'   },
  call_later:          { label: 'Rappeler',          variant: 'purple'   },
  no_reply:            { label: 'Pas de rép.',       variant: 'default'  },
  unreachable:         { label: 'Injoignable',       variant: 'default'  },
  out_of_stock:        { label: 'Rupture',           variant: 'warning'  },
  duplicate:           { label: 'Doublon',           variant: 'purple'   },
  delivery_no_answer:  { label: 'Pas rep. livraison',variant: 'warning'  },
  postponed:           { label: 'Reporté',           variant: 'warning'  },
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'default' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
