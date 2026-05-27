import { useMemo } from 'react';
import {
  BaseEdge,
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
import type { ErdPreviewDiagram } from '../api/erds';
import {
  buildErdFlowElements,
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
    <div className="w-[220px] overflow-hidden rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
      <div className="border-b border-blue-200 bg-blue-50 px-3.5 py-2 text-[13px] font-bold text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
        {data.name}
      </div>
      <div className="py-2">
        {data.fields.length > 0 ? data.fields.map((field) => (
          <div key={field} className="truncate px-3.5 py-0.5 text-xs leading-5">
            {field}
          </div>
        )) : (
          <div className="px-3.5 py-0.5 text-xs leading-5 text-gray-400 dark:text-gray-500">
            No fields
          </div>
        )}
      </div>
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
    borderRadius: 12,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: '#64748b', strokeWidth: 1.5 }} />
      <EdgeLabelRenderer>
        <ErdEdgeLabel x={sourceX} y={sourceY - 14} text={data?.fromCardinality ?? ''} />
        <ErdEdgeLabel x={labelX} y={labelY - 10} text={data?.label ?? ''} />
        <ErdEdgeLabel x={targetX} y={targetY - 14} text={data?.toCardinality ?? ''} />
      </EdgeLabelRenderer>
    </>
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
