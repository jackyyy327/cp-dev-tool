'use client'

import { useAnalysisStore } from '@/lib/analysis-store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trash2, Plus } from 'lucide-react'
import { OriginBadge, ReviewControls, TrustRow } from '@/components/trust/TrustBadges'
import type {
  InteractionName,
  PageTypeDraft,
  RequirementMapping,
} from '@/types/analysis'

const INTERACTION_OPTIONS: InteractionName[] = [
  'ViewCatalogObject',
  'ViewCategory',
  'ViewSearch',
  'QuickViewCatalogObject',
  'AddToCart',
  'UpdateLineItem',
  'RemoveFromCart',
  'ViewCart',
  'Purchase',
]

interface Props {
  pageType: PageTypeDraft | null
}

export function PageTypeEditor({ pageType }: Props) {
  const { state, dispatch, actions } = useAnalysisStore()
  const analysis = state.analysis!

  if (!pageType) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-500 border border-dashed border-gray-800 rounded-lg min-h-[400px]">
        Select or create a Page Type to begin editing.
      </div>
    )
  }

  const mappings = analysis.requirementMappings.filter((rm) =>
    rm.targets.some((t) => t.pageTypeRef === pageType.id),
  )
  const otherMappings = analysis.requirementMappings.filter(
    (rm) => !mappings.some((m) => m.id === rm.id),
  )
  const object = pageType.objectRefs[0]
    ? analysis.dataObjects.find((d) => d.id === pageType.objectRefs[0])
    : undefined
  const events = analysis.events.filter((e) => pageType.eventRefs.includes(e.id))

  return (
    <section className="space-y-4 min-w-0">
      <Card size="sm" className="bg-gray-900 border-gray-800 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] uppercase tracking-wide text-gray-500">Name</label>
            <input
              value={pageType.name}
              onChange={(e) =>
                dispatch({ type: 'RENAME_PAGE_TYPE', id: pageType.id, name: e.target.value })
              }
              className="block w-full bg-transparent text-lg font-semibold text-white outline-none border-b border-transparent focus:border-blue-500 py-0.5"
            />
            <label className="text-[10px] uppercase tracking-wide text-gray-500 mt-3 block">
              isMatch hint
            </label>
            <input
              value={pageType.isMatchHint}
              onChange={(e) =>
                dispatch({
                  type: 'UPDATE_PAGE_TYPE',
                  id: pageType.id,
                  patch: { isMatchHint: e.target.value },
                })
              }
              className="block w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs font-mono text-gray-300 outline-none focus:border-blue-500"
            />
            <label className="text-[10px] uppercase tracking-wide text-gray-500 mt-3 block">
              Page Interaction
            </label>
            <select
              value={pageType.interactionName ?? ''}
              onChange={(e) =>
                dispatch({
                  type: 'UPDATE_PAGE_TYPE',
                  id: pageType.id,
                  patch: {
                    interactionName: (e.target.value || undefined) as InteractionName | undefined,
                  },
                })
              }
              className="block w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-blue-500"
            >
              <option value="">(none)</option>
              {INTERACTION_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  SalesforceInteractions.{name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 items-end">
            <TrustRow origin={pageType.origin} review={pageType.review} />
            <ReviewControls
              review={pageType.review}
              onChange={(reviewState, note) => {
                actions.review('pageType', pageType.id, reviewState, note)
                if (reviewState === 'confirmed') {
                  dispatch({ type: 'UPDATE_PAGE_TYPE', id: pageType.id, patch: { status: 'confirmed' } })
                }
              }}
            />
            <MergeMenu pageType={pageType} />
            <Button
              size="xs"
              variant="outline"
              onClick={() => dispatch({ type: 'DELETE_PAGE_TYPE', id: pageType.id })}
              className="border-red-900 text-red-400 hover:bg-red-950/30"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </Button>
          </div>
        </div>
        {pageType.origin?.reason && (
          <p className="mt-3 text-[11px] text-gray-500">
            <span className="text-gray-600">Origin: </span>
            {pageType.origin.reason}
          </p>
        )}
      </Card>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
            Field Mapping
          </h3>
          {object && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => dispatch({ type: 'ADD_FIELD', objectId: object.id })}
              className="text-gray-400 hover:text-white"
            >
              <Plus className="w-3 h-3" /> Add Field
            </Button>
          )}
        </div>
        {!object ? (
          <p className="text-xs text-gray-600">
            No catalog object linked. Set a Page Interaction that implies a catalog object (e.g.
            ViewCatalogObject) and the workbench will attach a Product object.
          </p>
        ) : (
          <>
            <div className="text-xs text-gray-400 mb-2">
              <Badge variant="outline" className="border-gray-700 text-gray-300 mr-2">
                {object.type}
              </Badge>
              {object.label}
            </div>
            <table className="w-full text-xs">
              <thead className="text-gray-600">
                <tr>
                  <th className="text-left font-normal pb-1">Field</th>
                  <th className="text-left font-normal pb-1">Source</th>
                  <th className="text-left font-normal pb-1">Required</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {object.fields.map((f, i) => (
                  <tr key={i} className="border-t border-gray-800">
                    <td className="py-1.5">
                      <input
                        value={f.name}
                        onChange={(e) => {
                          const fields = [...object.fields]
                          fields[i] = { ...fields[i], name: e.target.value }
                          dispatch({
                            type: 'UPDATE_DATA_OBJECT',
                            id: object.id,
                            patch: { fields },
                          })
                        }}
                        className="bg-transparent text-gray-200 font-mono outline-none focus:bg-gray-950 px-1 rounded"
                      />
                    </td>
                    <td className="py-1.5">
                      <select
                        value={f.source}
                        onChange={(e) => {
                          const fields = [...object.fields]
                          fields[i] = { ...fields[i], source: e.target.value as typeof f.source }
                          dispatch({
                            type: 'UPDATE_DATA_OBJECT',
                            id: object.id,
                            patch: { fields },
                          })
                        }}
                        className="bg-gray-950 border border-gray-800 rounded px-1 py-0.5 text-gray-300"
                      >
                        <option value="jsonLd">jsonLd</option>
                        <option value="dataLayer">dataLayer</option>
                        <option value="dom">dom</option>
                        <option value="url">url</option>
                        <option value="manual">manual</option>
                      </select>
                    </td>
                    <td className="py-1.5">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) => {
                          const fields = [...object.fields]
                          fields[i] = { ...fields[i], required: e.target.checked }
                          dispatch({
                            type: 'UPDATE_DATA_OBJECT',
                            id: object.id,
                            patch: { fields },
                          })
                        }}
                      />
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => {
                          const fields = object.fields.filter((_, j) => j !== i)
                          dispatch({
                            type: 'UPDATE_DATA_OBJECT',
                            id: object.id,
                            patch: { fields },
                          })
                        }}
                        className="text-gray-600 hover:text-red-400"
                        aria-label="Remove field"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
            Event Suggestions
          </h3>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => dispatch({ type: 'ADD_EVENT', pageTypeId: pageType.id })}
            className="text-gray-400 hover:text-white"
          >
            <Plus className="w-3 h-3" /> Add Event
          </Button>
        </div>
        {events.length === 0 ? (
          <p className="text-xs text-gray-600">
            No events on this page type. Interaction events such as AddToCart are added as
            listener bindings.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex items-start justify-between gap-3 bg-gray-950 border border-gray-800 rounded px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <OriginBadge origin={ev.origin} />
                    <ReviewControls
                      review={ev.review}
                      compact
                      onChange={(rs) => actions.review('event', ev.id, rs)}
                    />
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <select
                      value={ev.kind}
                      onChange={(e) =>
                        dispatch({
                          type: 'UPDATE_EVENT',
                          id: ev.id,
                          patch: { kind: e.target.value as 'interaction' | 'customEvent' },
                        })
                      }
                      className="bg-gray-900 border border-gray-800 rounded px-1 py-0.5 text-[11px] text-gray-300"
                    >
                      <option value="interaction">interaction</option>
                      <option value="customEvent">customEvent</option>
                    </select>
                    {ev.kind === 'interaction' ? (
                      <select
                        value={ev.interactionName ?? 'AddToCart'}
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_EVENT',
                            id: ev.id,
                            patch: { interactionName: e.target.value as InteractionName },
                          })
                        }
                        className="bg-gray-900 border border-gray-800 rounded px-1 py-0.5 text-[11px] text-gray-300 font-mono"
                      >
                        {INTERACTION_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={ev.customName ?? ''}
                        placeholder="customEventName"
                        onChange={(e) =>
                          dispatch({
                            type: 'UPDATE_EVENT',
                            id: ev.id,
                            patch: { customName: e.target.value },
                          })
                        }
                        className="bg-gray-900 border border-gray-800 rounded px-1 py-0.5 text-[11px] text-gray-300 font-mono"
                      />
                    )}
                  </div>
                  <input
                    value={ev.triggerHint}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_EVENT',
                        id: ev.id,
                        patch: { triggerHint: e.target.value },
                      })
                    }
                    placeholder="trigger hint, e.g. click on button.add-to-cart"
                    className="block w-full bg-transparent text-[11px] text-gray-400 font-mono outline-none"
                  />
                </div>
                <button
                  onClick={() => dispatch({ type: 'REMOVE_EVENT', id: ev.id })}
                  className="text-gray-600 hover:text-red-400"
                  aria-label="Remove event"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-5">
        <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Requirement Mapping
        </h3>
        {mappings.length === 0 && (
          <p className="text-xs text-gray-600">No requirements mapped to this page type yet.</p>
        )}
        <ul className="space-y-2">
          {mappings.map((rm) => (
            <MappingRow key={rm.id} mapping={rm} pageTypeId={pageType.id} assigned />
          ))}
          {otherMappings.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wide text-gray-600 pt-2 border-t border-gray-800">
                Reassign from other page types
              </div>
              {otherMappings.map((rm) => (
                <MappingRow
                  key={rm.id}
                  mapping={rm}
                  pageTypeId={pageType.id}
                  assigned={false}
                />
              ))}
            </>
          )}
        </ul>
      </Card>
    </section>
  )
}

function MappingRow({
  mapping,
  pageTypeId,
  assigned,
}: {
  mapping: RequirementMapping
  pageTypeId: string
  assigned: boolean
}) {
  const { dispatch, state } = useAnalysisStore()

  function reassign() {
    const targets = assigned
      ? mapping.targets.filter((t) => t.pageTypeRef !== pageTypeId)
      : [...mapping.targets.filter((t) => !t.pageTypeRef), { pageTypeRef: pageTypeId }]
    dispatch({
      type: 'SET_ANALYSIS',
      analysis: {
        ...state.analysis!,
        requirementMappings: state.analysis!.requirementMappings.map((rm) =>
          rm.id === mapping.id
            ? { ...rm, targets, status: targets.length > 0 ? 'mapped' : 'unmapped' }
            : rm,
        ),
      },
    })
  }

  return (
    <li className="flex items-start justify-between gap-3 bg-gray-950 border border-gray-800 rounded px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-300">{mapping.text}</div>
        <div className="text-[10px] text-gray-600 capitalize mt-0.5">{mapping.status}</div>
      </div>
      <Button
        size="xs"
        variant="outline"
        onClick={reassign}
        className="border-gray-700 text-gray-300 hover:bg-gray-800"
      >
        {assigned ? 'Unassign' : 'Assign here'}
      </Button>
    </li>
  )
}

function MergeMenu({ pageType }: { pageType: PageTypeDraft }) {
  const { state, dispatch } = useAnalysisStore()
  const others = state.analysis!.pageTypes.filter((pt) => pt.id !== pageType.id)
  if (others.length === 0) return null
  return (
    <select
      onChange={(e) => {
        if (!e.target.value) return
        dispatch({ type: 'MERGE_PAGE_TYPES', sourceId: pageType.id, targetId: e.target.value })
        e.target.value = ''
      }}
      defaultValue=""
      className="bg-gray-950 border border-gray-800 rounded text-[11px] text-gray-400 px-1 py-1 hover:border-gray-700"
      aria-label="Merge into"
    >
      <option value="">
        Merge into…
      </option>
      {others.map((pt) => (
        <option key={pt.id} value={pt.id}>
          {pt.name}
        </option>
      ))}
    </select>
  )
}
