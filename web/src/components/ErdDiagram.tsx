import { useEffect } from 'react';

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
const TOP = 64;
const LEFT = 48;

export function ErdDiagram({ mermaid, zoom, onSizeChange }: ErdDiagramProps) {
  const { entities, relations } = parseMermaidErd(mermaid);

  if (entities.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
        No entities to preview
      </div>
    );
  }

  const boxes = entities.map((entity, index) => ({
    entity,
    x: LEFT + index * (ENTITY_WIDTH + ENTITY_GAP),
    y: TOP,
    height: HEADER_HEIGHT + Math.max(1, entity.fields.length) * FIELD_HEIGHT + 16,
  }));
  const boxByName = new Map(boxes.map(box => [box.entity.name, box]));
  const width = LEFT * 2 + boxes.length * ENTITY_WIDTH + Math.max(0, boxes.length - 1) * ENTITY_GAP;
  const height = Math.max(...boxes.map(box => box.y + box.height + TOP));

  useEffect(() => {
    onSizeChange?.({ width, height });
  }, [height, onSizeChange, width]);

  return (
    <div className="min-w-max min-h-max p-8" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <marker id="erd-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b" />
          </marker>
        </defs>

        {relations.map((relation, index) => {
          const from = boxByName.get(relation.from);
          const to = boxByName.get(relation.to);
          if (!from || !to) return null;
          const fromX = from.x + ENTITY_WIDTH;
          const fromY = from.y + from.height / 2 + index * 12;
          const toX = to.x;
          const toY = to.y + to.height / 2 + index * 12;
          const midX = (fromX + toX) / 2;

          return (
            <g key={`${relation.from}-${relation.to}-${relation.label}`}>
              <path
                d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                fill="none"
                stroke="#64748b"
                strokeWidth="1.5"
                markerEnd="url(#erd-arrow)"
              />
              <text x={fromX + 8} y={fromY - 6} fontSize="11" fill="#475569">{relation.fromCardinality}</text>
              <text x={toX - 24} y={toY - 6} fontSize="11" fill="#475569">{relation.toCardinality}</text>
              <text x={midX - 20} y={(fromY + toY) / 2 - 8} fontSize="11" fill="#334155">{relation.label}</text>
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
