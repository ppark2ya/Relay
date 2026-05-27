import { useEffect } from 'react';
import { buildEntityLayout, buildRelationConnector, type DiagramBox } from './ErdDiagramGeometry';

interface DiagramEntity {
  name: string;
  fields: string[];
}

interface DiagramRelation {
  from: string;
  fromCardinality: string;
  to: string;
  toCardinality: string;
  label: string;
}

interface ErdDiagramProps {
  mermaid: string;
  zoom: number;
  onSizeChange?: (size: { width: number; height: number }) => void;
}

const ENTITY_WIDTH = 220;
const HEADER_HEIGHT = 34;
const FIELD_HEIGHT = 22;
const ENTITY_GAP = 120;
const ROW_GAP = 44;
const TOP = 72;
const LEFT = 96;
const CONNECTOR_MARGIN = 36;

export function ErdDiagram({ mermaid, zoom, onSizeChange }: ErdDiagramProps) {
  const { entities, relations } = parseMermaidErd(mermaid);
  const layout = buildEntityLayout({
    entities,
    relations,
    entityWidth: ENTITY_WIDTH,
    headerHeight: HEADER_HEIGHT,
    fieldHeight: FIELD_HEIGHT,
    entityGap: ENTITY_GAP,
    rowGap: ROW_GAP,
    top: TOP,
    left: LEFT,
  });
  const boxes = layout.boxes;
  const boxByName = layout.boxByName;
  const relationPairIndexes = new Map<string, number>();
  const endpointSlotCounts = countEndpointSlots(relations, boxByName);
  const endpointSlotIndexes = new Map<string, number>();
  const renderedRelations = relations.map((relation, index) => {
    const from = boxByName.get(relation.from);
    const to = boxByName.get(relation.to);
    if (!from || !to) return null;
    const pairKey = [relation.from, relation.to].sort().join('::');
    const pairIndex = relationPairIndexes.get(pairKey) ?? 0;
    relationPairIndexes.set(pairKey, pairIndex + 1);
    const fromSide = relationEndpointSide(from, to);
    const toSide = relationEndpointSide(to, from);
    const fromSlotKey = endpointSlotKey(relation.from, fromSide);
    const toSlotKey = endpointSlotKey(relation.to, toSide);
    const fromSlotIndex = endpointSlotIndexes.get(fromSlotKey) ?? 0;
    const toSlotIndex = endpointSlotIndexes.get(toSlotKey) ?? 0;
    endpointSlotIndexes.set(fromSlotKey, fromSlotIndex + 1);
    endpointSlotIndexes.set(toSlotKey, toSlotIndex + 1);
    const connector = buildRelationConnector({
      from,
      to,
      fromIndex: index,
      pairIndex,
      entityWidth: ENTITY_WIDTH,
      fromSlot: { index: fromSlotIndex, count: endpointSlotCounts.get(fromSlotKey) ?? 1 },
      toSlot: { index: toSlotIndex, count: endpointSlotCounts.get(toSlotKey) ?? 1 },
    });

    return { relation, connector };
  });
  const connectorBounds = renderedRelations.flatMap(item => item ? [item.connector.bounds] : []);
  const width = Math.max(
    layout.width,
    connectorBounds.length === 0 ? 1 : Math.max(...connectorBounds.map(bounds => bounds.maxX)) + CONNECTOR_MARGIN,
  );
  const height = Math.max(
    layout.height,
    connectorBounds.length === 0 ? 1 : Math.max(...connectorBounds.map(bounds => bounds.maxY)) + CONNECTOR_MARGIN,
  );

  useEffect(() => {
    onSizeChange?.({ width, height });
  }, [height, onSizeChange, width]);

  if (entities.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
        No entities to preview
      </div>
    );
  }

  return (
    <div className="min-w-max min-h-max p-8" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
      <svg width={width} height={height} className="overflow-visible">
        {renderedRelations.map((item) => {
          if (!item) return null;
          const { relation, connector } = item;
          return (
            <g key={`${relation.from}-${relation.to}-${relation.label}`}>
              <path
                d={connector.path}
                fill="none"
                stroke="#64748b"
                strokeWidth="1.5"
              />
              <text
                x={connector.from.labelX}
                y={connector.from.y - 6}
                fontSize="11"
                textAnchor={connector.from.labelAnchor}
                fill="#475569"
              >
                {relation.fromCardinality}
              </text>
              <text
                x={connector.to.labelX}
                y={connector.to.y - 6}
                fontSize="11"
                textAnchor={connector.to.labelAnchor}
                fill="#475569"
              >
                {relation.toCardinality}
              </text>
              <text x={connector.labelX} y={connector.labelY} fontSize="11" textAnchor="middle" fill="#334155">
                {relation.label}
              </text>
            </g>
          );
        })}

        {boxes.map(({ entity, x, y, height }) => (
          <g key={entity.name}>
            <rect x={x} y={y} width={ENTITY_WIDTH} height={height} rx="6" fill="#ffffff" stroke="#cbd5e1" />
            <rect x={x} y={y} width={ENTITY_WIDTH} height={HEADER_HEIGHT} rx="6" fill="#eff6ff" stroke="#bfdbfe" />
            <text x={x + 14} y={y + 22} fontSize="13" fontWeight="700" fill="#1e3a8a">{entity.name}</text>
            {entity.fields.map((field, fieldIndex) => (
              <text key={field} x={x + 14} y={y + HEADER_HEIGHT + 22 + fieldIndex * FIELD_HEIGHT} fontSize="12" fill="#334155">
                {field}
              </text>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

function parseMermaidErd(mermaid: string): { entities: DiagramEntity[]; relations: DiagramRelation[] } {
  const entities: DiagramEntity[] = [];
  const relations: DiagramRelation[] = [];
  const lines = mermaid.split('\n').map(line => line.trim()).filter(Boolean);
  let current: DiagramEntity | null = null;

  for (const line of lines) {
    if (line === 'erDiagram') continue;
    if (line.endsWith('{')) {
      current = { name: line.replace('{', '').trim(), fields: [] };
      entities.push(current);
      continue;
    }
    if (line === '}') {
      current = null;
      continue;
    }
    if (current) {
      current.fields.push(line);
      continue;
    }

    const match = line.match(/^(\w+)\s+(\S+)--(\S+)\s+(\w+)\s+:\s+(.+)$/);
    if (match) {
      relations.push({
        from: match[1],
        fromCardinality: match[2],
        toCardinality: match[3],
        to: match[4],
        label: match[5],
      });
    }
  }

  return { entities, relations };
}

function countEndpointSlots(relations: DiagramRelation[], boxByName: Map<string, DiagramBox>) {
  const counts = new Map<string, number>();
  for (const relation of relations) {
    const from = boxByName.get(relation.from);
    const to = boxByName.get(relation.to);
    if (!from || !to) continue;
    const fromSide = relationEndpointSide(from, to);
    const toSide = relationEndpointSide(to, from);
    increment(counts, endpointSlotKey(relation.from, fromSide));
    increment(counts, endpointSlotKey(relation.to, toSide));
  }
  return counts;
}

function relationEndpointSide(from: DiagramBox, to: DiagramBox) {
  return from.x + ENTITY_WIDTH / 2 <= to.x + ENTITY_WIDTH / 2 ? 'right' : 'left';
}

function endpointSlotKey(entityName: string, side: string) {
  return `${entityName}:${side}`;
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}
