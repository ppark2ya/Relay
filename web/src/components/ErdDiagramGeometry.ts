interface ConnectorBox {
  x: number;
  y: number;
  height: number;
}

export interface DiagramLayoutEntity {
  name: string;
  fields: string[];
}

export interface DiagramLayoutRelation {
  from: string;
  fromCardinality: string;
  to: string;
  toCardinality: string;
  label: string;
}

export interface DiagramBox extends ConnectorBox {
  entity: DiagramLayoutEntity;
}

interface EntityLayoutOptions {
  entities: DiagramLayoutEntity[];
  relations: DiagramLayoutRelation[];
  entityWidth?: number;
  headerHeight?: number;
  fieldHeight?: number;
  entityGap?: number;
  rowGap?: number;
  left?: number;
  top?: number;
}

interface EntityLayout {
  boxes: DiagramBox[];
  boxByName: Map<string, DiagramBox>;
  width: number;
  height: number;
  entityWidth: number;
}

interface RelationConnectorInput {
  from: ConnectorBox;
  to: ConnectorBox;
  fromIndex: number;
  pairIndex: number;
  entityWidth: number;
  fromSlot?: RelationEndpointSlot;
  toSlot?: RelationEndpointSlot;
}

interface RelationEndpoint {
  x: number;
  y: number;
  labelX: number;
  labelAnchor: 'start' | 'end';
}

interface RelationEndpointSlot {
  index: number;
  count: number;
}

interface RelationConnector {
  path: string;
  routeX: number;
  labelX: number;
  labelY: number;
  from: RelationEndpoint;
  to: RelationEndpoint;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

const DEFAULT_ENTITY_WIDTH = 220;
const DEFAULT_HEADER_HEIGHT = 34;
const DEFAULT_FIELD_HEIGHT = 22;
const DEFAULT_ENTITY_GAP = 120;
const DEFAULT_ROW_GAP = 44;
const DEFAULT_LEFT = 96;
const DEFAULT_TOP = 72;
const CONNECTOR_STUB = 36;
const CONNECTOR_OFFSET = 16;

export function buildEntityLayout({
  entities,
  relations,
  entityWidth = DEFAULT_ENTITY_WIDTH,
  headerHeight = DEFAULT_HEADER_HEIGHT,
  fieldHeight = DEFAULT_FIELD_HEIGHT,
  entityGap = DEFAULT_ENTITY_GAP,
  rowGap = DEFAULT_ROW_GAP,
  left = DEFAULT_LEFT,
  top = DEFAULT_TOP,
}: EntityLayoutOptions): EntityLayout {
  const entityByName = new Map(entities.map(entity => [entity.name, entity]));
  const columnByName = new Map(entities.map(entity => [entity.name, 0]));

  for (let pass = 0; pass < entities.length; pass += 1) {
    let changed = false;

    for (const relation of relations) {
      const constraint = relationColumnConstraint(relation);
      if (!constraint || !entityByName.has(constraint.left) || !entityByName.has(constraint.right)) {
        continue;
      }

      const leftColumn = columnByName.get(constraint.left) ?? 0;
      const rightColumn = columnByName.get(constraint.right) ?? 0;
      const nextRightColumn = leftColumn + 1;
      if (rightColumn < nextRightColumn) {
        columnByName.set(constraint.right, nextRightColumn);
        changed = true;
      }
    }

    if (!changed) break;
  }

  const columnEntities = new Map<number, DiagramLayoutEntity[]>();
  for (const entity of entities) {
    const column = columnByName.get(entity.name) ?? 0;
    columnEntities.set(column, [...(columnEntities.get(column) ?? []), entity]);
  }

  const sortedColumns = [...columnEntities.keys()].sort((a, b) => a - b);
  const entityHeights = new Map(entities.map(entity => [entity.name, entityHeight(entity, headerHeight, fieldHeight)]));
  const columnHeights = new Map(sortedColumns.map((column) => {
    const columnItems = columnEntities.get(column) ?? [];
    const totalHeight = columnItems.reduce((sum, entity) => sum + (entityHeights.get(entity.name) ?? 0), 0)
      + Math.max(0, columnItems.length - 1) * rowGap;
    return [column, totalHeight];
  }));
  const maxColumnHeight = Math.max(0, ...columnHeights.values());
  const boxes: DiagramBox[] = [];

  sortedColumns.forEach((column, visualColumnIndex) => {
    const columnItems = columnEntities.get(column) ?? [];
    const columnHeight = columnHeights.get(column) ?? 0;
    let y = top + Math.max(0, (maxColumnHeight - columnHeight) / 2);
    const x = left + visualColumnIndex * (entityWidth + entityGap);

    for (const entity of columnItems) {
      const height = entityHeights.get(entity.name) ?? entityHeight(entity, headerHeight, fieldHeight);
      boxes.push({ entity, x, y, height });
      y += height + rowGap;
    }
  });

  return {
    boxes,
    boxByName: new Map(boxes.map(box => [box.entity.name, box])),
    width: sortedColumns.length === 0
      ? 1
      : left * 2 + sortedColumns.length * entityWidth + Math.max(0, sortedColumns.length - 1) * entityGap,
    height: boxes.length === 0 ? 1 : top * 2 + maxColumnHeight,
    entityWidth,
  };
}

export function buildRelationConnector({
  from,
  to,
  pairIndex,
  entityWidth,
  fromSlot,
  toSlot,
}: RelationConnectorInput): RelationConnector {
  const fromCenterX = from.x + entityWidth / 2;
  const toCenterX = to.x + entityWidth / 2;
  const fromIsLeft = fromCenterX <= toCenterX;
  const offset = pairIndex * CONNECTOR_OFFSET;
  const fromY = endpointY(from, fromSlot) + offset;
  const toY = endpointY(to, toSlot) + offset;
  const fromX = fromIsLeft ? from.x + entityWidth : from.x;
  const toX = fromIsLeft ? to.x : to.x + entityWidth;
  const fromDir = fromIsLeft ? 1 : -1;
  const toDir = fromIsLeft ? -1 : 1;
  const fromStubX = fromX + fromDir * CONNECTOR_STUB;
  const toStubX = toX + toDir * CONNECTOR_STUB;
  const routeX = fromStubX;
  const labelX = (fromStubX + toStubX) / 2;
  const labelY = (fromY + toY) / 2 - 8;
  const fromLabelX = fromX + fromDir * 10;
  const toLabelX = toX + toDir * 10;
  const minX = Math.min(fromX, fromStubX, toStubX, toX, labelX, fromLabelX, toLabelX);
  const maxX = Math.max(fromX, fromStubX, toStubX, toX, labelX, fromLabelX, toLabelX);
  const minY = Math.min(fromY, toY, labelY);
  const maxY = Math.max(fromY, toY, labelY);

  return {
    path: `M ${fromX} ${fromY} H ${fromStubX} V ${toY} H ${toStubX} H ${toX}`,
    routeX,
    labelX,
    labelY,
    from: {
      x: fromX,
      y: fromY,
      labelX: fromLabelX,
      labelAnchor: fromIsLeft ? 'start' : 'end',
    },
    to: {
      x: toX,
      y: toY,
      labelX: toLabelX,
      labelAnchor: fromIsLeft ? 'end' : 'start',
    },
    bounds: { minX, maxX, minY, maxY },
  };
}

function relationColumnConstraint(relation: DiagramLayoutRelation): { left: string; right: string } | null {
  const fromMany = isManyCardinality(relation.fromCardinality);
  const toMany = isManyCardinality(relation.toCardinality);

  if (fromMany && !toMany) {
    return { left: relation.to, right: relation.from };
  }
  if (!fromMany && toMany) {
    return { left: relation.from, right: relation.to };
  }
  if (relation.from !== relation.to) {
    return { left: relation.from, right: relation.to };
  }
  return null;
}

function isManyCardinality(cardinality: string) {
  return cardinality.includes('{') || cardinality.includes('}');
}

function entityHeight(entity: DiagramLayoutEntity, headerHeight: number, fieldHeight: number) {
  return headerHeight + Math.max(1, entity.fields.length) * fieldHeight + 16;
}

function endpointY(box: ConnectorBox, slot?: RelationEndpointSlot) {
  const count = Math.max(1, slot?.count ?? 1);
  const index = Math.min(Math.max(0, slot?.index ?? 0), count - 1);
  if (count === 1) {
    return box.y + box.height / 2;
  }
  return box.y + (box.height * (index + 1)) / (count + 1);
}
