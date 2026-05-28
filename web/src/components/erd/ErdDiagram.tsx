import { useMemo } from 'react';
import {
  Controls,
  EdgeLabelRenderer,
  Handle,
  ReactFlow,
  ReactFlowProvider,
  Position,
  getSmoothStepPath,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react';
import type { ErdPreviewDiagram } from '../../api/erds';
import {
  buildEndpointSymbolGeometry,
  buildErdFlowElements,
  type DiagramLayoutColumn,
  type EndpointSymbolPrimitive,
  type ErdEntityNode,
  type ErdRelationEdge,
} from './ErdDiagramGeometry';

interface ErdDiagramProps {
  diagram: ErdPreviewDiagram;
}

const nodeTypes = {
  erdEntity: ErdEntityNodeView,
};

const edgeTypes = {
  erdRelation: ErdRelationEdgeView,
};

export function ErdDiagram({ diagram }: ErdDiagramProps) {
  const { nodes, edges } = useMemo(() => buildErdFlowElements(diagram), [diagram]);

  if (diagram.entities.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
        No entities to preview
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <ReactFlow<ErdEntityNode, ErdRelationEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.4}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        className="bg-gray-50 dark:bg-gray-900"
      >
        <Controls showInteractive={false} position="top-right" />
      </ReactFlow>
    </ReactFlowProvider>
  );
}

function ErdEntityNodeView({ data }: NodeProps<ErdEntityNode>) {
  return (
    <div className="w-[340px] overflow-hidden rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
      <Handle id="target-left" type="target" position={Position.Left} className="opacity-0" />
      <Handle id="target-right" type="target" position={Position.Right} className="opacity-0" />
      <Handle id="source-left" type="source" position={Position.Left} className="opacity-0" />
      <Handle id="source-right" type="source" position={Position.Right} className="opacity-0" />
      <div className="border-b border-blue-200 bg-blue-50 px-3.5 py-2 text-[13px] font-bold text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
        {data.name}
      </div>
      <ErdEntityColumnRows columns={data.columns} />
    </div>
  );
}

export function ErdEntityColumnRows({ columns }: { columns: DiagramLayoutColumn[] }) {
  return (
    <div className="py-2">
      {columns.length > 0 ? columns.map((column, index) => (
        <div
          key={`${column.name}-${index}`}
          className="grid grid-cols-[54px_minmax(0,1fr)_96px_62px] items-center px-3.5 py-0.5 text-xs leading-5"
        >
          <div className="min-w-0 truncate border-r border-slate-200 pr-2 font-semibold text-blue-700 dark:border-gray-600 dark:text-blue-300">
            {(column.keys ?? []).join(',')}
          </div>
          <div className="min-w-0 truncate pl-2 font-medium" title={column.name}>
            {column.name}
          </div>
          <div className="min-w-0 truncate font-mono text-[11px] text-slate-600 dark:text-gray-300" title={column.type}>
            {column.type}
          </div>
          <div className="text-right font-mono text-[10px] font-semibold text-slate-500 dark:text-gray-400">
            {column.nullable ? 'NULL' : 'NOT NULL'}
          </div>
        </div>
      )) : (
        <div className="px-3.5 py-0.5 text-xs leading-5 text-gray-400 dark:text-gray-500">
          No columns
        </div>
      )}
    </div>
  );
}

function ErdRelationEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<ErdRelationEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  });
  const sourceToward = endpointToward(sourceX, sourceY, sourcePosition);
  const targetToward = endpointToward(targetX, targetY, targetPosition);
  const sourceSymbols = buildEndpointSymbolGeometry({
    x: sourceX,
    y: sourceY,
    towardX: sourceToward.x,
    towardY: sourceToward.y,
    symbol: data?.fromCardinality ?? '',
  });
  const targetSymbols = buildEndpointSymbolGeometry({
    x: targetX,
    y: targetY,
    towardX: targetToward.x,
    towardY: targetToward.y,
    symbol: data?.toCardinality ?? '',
  });

  return (
    <>
      <path id={id} d={edgePath} fill="none" stroke="#64748b" strokeWidth={1.5} />
      <EndpointSymbols primitives={sourceSymbols} />
      <EndpointSymbols primitives={targetSymbols} />
      <EdgeLabelRenderer>
        <ErdEdgeLabel x={labelX} y={labelY - 10} text={data?.label ?? ''} />
      </EdgeLabelRenderer>
    </>
  );
}

function endpointToward(x: number, y: number, position: Position) {
  switch (position) {
    case Position.Left:
      return { x: x - 1, y };
    case Position.Right:
      return { x: x + 1, y };
    case Position.Top:
      return { x, y: y - 1 };
    case Position.Bottom:
      return { x, y: y + 1 };
    default:
      return { x: x + 1, y };
  }
}

function EndpointSymbols({ primitives }: { primitives: EndpointSymbolPrimitive[] }) {
  return (
    <g stroke="#475569" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {primitives.map((primitive, index) => {
        if (primitive.type === 'circle') {
          return (
            <circle
              key={`circle-${index}`}
              cx={primitive.cx}
              cy={primitive.cy}
              r={primitive.r}
              fill="white"
              className="dark:fill-gray-900"
            />
          );
        }
        return (
          <line
            key={`line-${index}`}
            x1={primitive.x1}
            y1={primitive.y1}
            x2={primitive.x2}
            y2={primitive.y2}
          />
        );
      })}
    </g>
  );
}

function ErdEdgeLabel({ x, y, text }: { x: number; y: number; text: string }) {
  if (!text) return null;
  return (
    <div
      className="absolute rounded bg-white/90 px-1.5 py-0.5 text-[11px] leading-none text-slate-700 shadow-sm dark:bg-gray-800/90 dark:text-gray-200"
      style={{
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
      }}
    >
      {text}
    </div>
  );
}
