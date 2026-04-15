'use client'

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import type {
  AnalysisResult,
  DataObjectDraft,
  EventDraft,
  PageTypeDraft,
  Phase,
  RequirementInput,
} from '@/types/analysis'

interface State {
  phase: Phase
  siteUrlInput: string
  requirementInput: RequirementInput
  analysis: AnalysisResult | null
  selectedPageTypeId: string | null
  error: string | null
}

type Action =
  | { type: 'SET_PHASE'; phase: Phase }
  | { type: 'SET_INPUT'; siteUrl: string; requirement: RequirementInput }
  | { type: 'SET_ANALYSIS'; analysis: AnalysisResult }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'SELECT_PAGE_TYPE'; id: string }
  | { type: 'RENAME_PAGE_TYPE'; id: string; name: string }
  | { type: 'DELETE_PAGE_TYPE'; id: string }
  | { type: 'MERGE_PAGE_TYPES'; sourceId: string; targetId: string }
  | { type: 'ADD_PAGE_TYPE' }
  | { type: 'UPDATE_PAGE_TYPE'; id: string; patch: Partial<PageTypeDraft> }
  | { type: 'ADD_FIELD'; objectId: string }
  | { type: 'UPDATE_DATA_OBJECT'; id: string; patch: Partial<DataObjectDraft> }
  | { type: 'UPDATE_EVENT'; id: string; patch: Partial<EventDraft> }
  | { type: 'ADD_EVENT'; pageTypeId: string }
  | { type: 'REMOVE_EVENT'; id: string }
  | { type: 'CONFIRM_PENDING'; id: string }
  | { type: 'DISMISS_PENDING'; id: string }
  | { type: 'RESET' }

const initialState: State = {
  phase: 'input',
  siteUrlInput: '',
  requirementInput: { rawText: '' },
  analysis: null,
  selectedPageTypeId: null,
  error: null,
}

function mapAnalysis(
  state: State,
  updater: (a: AnalysisResult) => AnalysisResult,
): State {
  if (!state.analysis) return state
  return { ...state, analysis: updater(state.analysis) }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase }
    case 'SET_INPUT':
      return {
        ...state,
        siteUrlInput: action.siteUrl,
        requirementInput: action.requirement,
        error: null,
      }
    case 'SET_ANALYSIS':
      return {
        ...state,
        analysis: action.analysis,
        selectedPageTypeId: action.analysis.pageTypes[0]?.id ?? null,
        error: null,
      }
    case 'SET_ERROR':
      return { ...state, error: action.error }
    case 'SELECT_PAGE_TYPE':
      return { ...state, selectedPageTypeId: action.id }
    case 'RENAME_PAGE_TYPE':
      return mapAnalysis(state, (a) => ({
        ...a,
        pageTypes: a.pageTypes.map((pt) =>
          pt.id === action.id ? { ...pt, name: action.name, status: 'edited' } : pt,
        ),
      }))
    case 'DELETE_PAGE_TYPE': {
      const next = mapAnalysis(state, (a) => ({
        ...a,
        pageTypes: a.pageTypes.filter((pt) => pt.id !== action.id),
        requirementMappings: a.requirementMappings.map((rm) => ({
          ...rm,
          targets: rm.targets.filter((t) => t.pageTypeRef !== action.id),
          status: rm.targets.some((t) => t.pageTypeRef === action.id) ? 'unmapped' : rm.status,
        })),
      }))
      if (next.selectedPageTypeId === action.id) {
        next.selectedPageTypeId = next.analysis?.pageTypes[0]?.id ?? null
      }
      return next
    }
    case 'MERGE_PAGE_TYPES':
      return mapAnalysis(state, (a) => {
        const source = a.pageTypes.find((pt) => pt.id === action.sourceId)
        if (!source) return a
        return {
          ...a,
          pageTypes: a.pageTypes
            .filter((pt) => pt.id !== action.sourceId)
            .map((pt) =>
              pt.id === action.targetId
                ? {
                    ...pt,
                    objectRefs: unique([...pt.objectRefs, ...source.objectRefs]),
                    eventRefs: unique([...pt.eventRefs, ...source.eventRefs]),
                    sampleUrls: unique([...pt.sampleUrls, ...source.sampleUrls]),
                    evidenceRefs: unique([...pt.evidenceRefs, ...source.evidenceRefs]),
                    status: 'edited',
                  }
                : pt,
            ),
        }
      })
    case 'ADD_PAGE_TYPE':
      return mapAnalysis(state, (a) => {
        const id = 'pt_' + Math.random().toString(36).slice(2, 8)
        return {
          ...a,
          pageTypes: [
            ...a.pageTypes,
            {
              id,
              name: 'Untitled Page Type',
              isMatchHint: 'pathname === "/"',
              objectRefs: [],
              eventRefs: [],
              sampleUrls: [],
              confidence: 'low',
              status: 'edited',
              evidenceRefs: [],
            },
          ],
        }
      })
    case 'UPDATE_PAGE_TYPE':
      return mapAnalysis(state, (a) => ({
        ...a,
        pageTypes: a.pageTypes.map((pt) =>
          pt.id === action.id ? { ...pt, ...action.patch, status: 'edited' } : pt,
        ),
      }))
    case 'ADD_FIELD':
      return mapAnalysis(state, (a) => ({
        ...a,
        dataObjects: a.dataObjects.map((d) =>
          d.id === action.objectId
            ? {
                ...d,
                fields: [...d.fields, { name: 'newField', source: 'manual', required: false }],
              }
            : d,
        ),
      }))
    case 'UPDATE_DATA_OBJECT':
      return mapAnalysis(state, (a) => ({
        ...a,
        dataObjects: a.dataObjects.map((d) => (d.id === action.id ? { ...d, ...action.patch } : d)),
      }))
    case 'UPDATE_EVENT':
      return mapAnalysis(state, (a) => ({
        ...a,
        events: a.events.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      }))
    case 'ADD_EVENT':
      return mapAnalysis(state, (a) => {
        const id = 'ev_' + Math.random().toString(36).slice(2, 8)
        return {
          ...a,
          events: [
            ...a.events,
            {
              id,
              kind: 'interaction',
              interactionName: 'AddToCart',
              pageTypeRefs: [action.pageTypeId],
              triggerHint: 'click on button.add-to-cart',
            },
          ],
          pageTypes: a.pageTypes.map((pt) =>
            pt.id === action.pageTypeId ? { ...pt, eventRefs: [...pt.eventRefs, id] } : pt,
          ),
        }
      })
    case 'REMOVE_EVENT':
      return mapAnalysis(state, (a) => ({
        ...a,
        events: a.events.filter((e) => e.id !== action.id),
        pageTypes: a.pageTypes.map((pt) => ({
          ...pt,
          eventRefs: pt.eventRefs.filter((ref) => ref !== action.id),
        })),
      }))
    case 'CONFIRM_PENDING':
    case 'DISMISS_PENDING':
      return mapAnalysis(state, (a) => ({
        ...a,
        pendingConfirmations: a.pendingConfirmations.filter((p) => p.id !== action.id),
      }))
    case 'RESET':
      return initialState
    default:
      return state
  }
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

interface StoreContext {
  state: State
  dispatch: React.Dispatch<Action>
  actions: {
    startAnalysis: (siteUrl: string, requirement: RequirementInput) => void
    finishLoading: (analysis: AnalysisResult) => void
    goToWorkbench: () => void
    goToResult: () => void
    backToInput: () => void
    backToWorkbench: () => void
  }
}

const Ctx = createContext<StoreContext | null>(null)

export function AnalysisStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const actions = useMemo(
    () => ({
      startAnalysis: (siteUrl: string, requirement: RequirementInput) => {
        dispatch({ type: 'SET_INPUT', siteUrl, requirement })
        dispatch({ type: 'SET_PHASE', phase: 'loading' })
      },
      finishLoading: (analysis: AnalysisResult) => {
        dispatch({ type: 'SET_ANALYSIS', analysis })
        dispatch({ type: 'SET_PHASE', phase: 'workbench' })
      },
      failLoading: (error: string) => {
        dispatch({ type: 'SET_ERROR', error })
      },
      goToWorkbench: () => dispatch({ type: 'SET_PHASE', phase: 'workbench' }),
      goToResult: () => dispatch({ type: 'SET_PHASE', phase: 'result' }),
      backToInput: () => dispatch({ type: 'RESET' }),
      backToWorkbench: () => dispatch({ type: 'SET_PHASE', phase: 'workbench' }),
    }),
    [],
  )

  const value = useMemo(() => ({ state, dispatch, actions }), [state, actions])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAnalysisStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAnalysisStore must be used inside AnalysisStoreProvider')
  return ctx
}

export function useAnalysis() {
  const { state } = useAnalysisStore()
  return state.analysis
}
