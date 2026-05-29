import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErdDiagram, ErdEntityColumnRows } from '../src/components/erd/ErdDiagram';
import {
  buildEndpointSymbolGeometry,
  buildEntityLayout,
  buildErdFlowElements,
  buildRelationConnector,
  type DiagramLayoutColumn,
} from '../src/components/erd/ErdDiagramGeometry';

const userBox = { x: 48, y: 64, height: 94 };
const orderBox = { x: 388, y: 64, height: 94 };
const userColumns: DiagramLayoutColumn[] = [
  { keys: ['PK'], name: 'id', type: 'BIGINT', nullable: false },
  { keys: ['UK'], name: 'email', type: 'VARCHAR(255)', nullable: false },
];
const orderColumns: DiagramLayoutColumn[] = [
  { keys: ['PK'], name: 'id', type: 'BIGINT', nullable: false },
  { keys: [], name: 'amount', type: 'DECIMAL(19,2)', nullable: false },
  { keys: ['FK'], name: 'user_id', type: 'BIGINT', nullable: false },
];

describe('buildRelationConnector', () => {
  test('connects from the left side when the source is to the right of the target', () => {
    const connector = buildRelationConnector({
      from: orderBox,
      to: userBox,
      fromIndex: 0,
      pairIndex: 0,
      entityWidth: 220,
    });

    expect(connector.from.x).toBe(orderBox.x);
    expect(connector.from.labelX).toBeLessThan(orderBox.x);
    expect(connector.to.x).toBe(userBox.x + 220);
    expect(connector.to.labelX).toBeGreaterThan(userBox.x + 220);
    expect(connector.path).toContain(`M ${orderBox.x}`);
  });

  test('connects from the right side when the source is to the left of the target', () => {
    const connector = buildRelationConnector({
      from: userBox,
      to: orderBox,
      fromIndex: 0,
      pairIndex: 0,
      entityWidth: 220,
    });

    expect(connector.from.x).toBe(userBox.x + 220);
    expect(connector.from.labelX).toBeGreaterThan(userBox.x + 220);
    expect(connector.to.x).toBe(orderBox.x);
    expect(connector.to.labelX).toBeLessThan(orderBox.x);
    expect(connector.path).toContain(`M ${userBox.x + 220}`);
  });

  test('offsets repeated relations between the same pair', () => {
    const first = buildRelationConnector({
      from: userBox,
      to: orderBox,
      fromIndex: 0,
      pairIndex: 0,
      entityWidth: 220,
    });
    const second = buildRelationConnector({
      from: userBox,
      to: orderBox,
      fromIndex: 1,
      pairIndex: 1,
      entityWidth: 220,
    });

    expect(second.from.y).not.toBe(first.from.y);
    expect(second.to.y).not.toBe(first.to.y);
    expect(second.path).not.toBe(first.path);
  });
});

describe('buildEntityLayout', () => {
  test('stacks multiple child entities beside their referenced parent', () => {
    const layout = buildEntityLayout({
      entities: [
        { name: 'User', columns: userColumns },
        { name: 'Order', columns: orderColumns },
        { name: 'Trans', columns: orderColumns },
      ],
      relations: [
        { from: 'Order', fromCardinality: 'O<', to: 'User', toCardinality: '||', label: 'user' },
        { from: 'Trans', fromCardinality: 'O<', to: 'User', toCardinality: '||', label: 'user' },
      ],
    });

    const user = layout.boxByName.get('User');
    const order = layout.boxByName.get('Order');
    const trans = layout.boxByName.get('Trans');

    expect(user).toBeDefined();
    expect(order).toBeDefined();
    expect(trans).toBeDefined();
    expect(user!.x).toBeLessThan(order!.x);
    expect(order!.x).toBe(trans!.x);
    expect(trans!.y).toBeGreaterThan(order!.y + order!.height);

    const connector = buildRelationConnector({
      from: trans!,
      to: user!,
      fromIndex: 1,
      pairIndex: 0,
      entityWidth: layout.entityWidth,
    });

    expect(connector.routeX).toBeGreaterThan(user!.x + layout.entityWidth);
    expect(connector.routeX).toBeLessThan(order!.x);
  });
});

describe('ErdDiagram', () => {
  test('mounts a React Flow preview for structured diagram data', () => {
    const markup = renderToStaticMarkup(createElement(ErdDiagram, {
      diagram: {
        entities: [
          { name: 'User', columns: userColumns },
          { name: 'Order', columns: orderColumns },
        ],
        relations: [
          { from: 'Order', fromCardinality: 'O<', to: 'User', toCardinality: '||', label: 'user' },
        ],
      },
    }));

    expect(markup).toContain('react-flow');
  });

  test('renders structured column rows with keys, MySQL types, and nullability', () => {
    const markup = renderToStaticMarkup(createElement(ErdEntityColumnRows, {
      columns: userColumns,
    }));

    expect(markup).toContain('PK');
    expect(markup).toContain('VARCHAR(255)');
    expect(markup).toContain('NOT NULL');
  });

  test('renders modified column rows with rose background highlighting', () => {
    const markup = renderToStaticMarkup(createElement(ErdEntityColumnRows, {
      columns: [
        { keys: ['UK'], name: 'email', type: 'VARCHAR(320)', nullable: false, modified: true },
      ],
    }));

    expect(markup).toContain('bg-rose-400');
    expect(markup).toContain('email');
  });

  test('renders an empty state when no entities are present', () => {
    const markup = renderToStaticMarkup(createElement(ErdDiagram, {
      diagram: { entities: [], relations: [] },
    }));

    expect(markup).toContain('No entities to preview');
  });
});

describe('buildErdFlowElements', () => {
  test('converts ERD preview data into read-only React Flow nodes and edges', () => {
    const elements = buildErdFlowElements({
      entities: [
        { name: 'User', columns: userColumns },
        { name: 'Order', columns: orderColumns },
      ],
      relations: [
        { from: 'Order', fromCardinality: 'O<', to: 'User', toCardinality: '||', label: 'user' },
      ],
    });

    expect(elements.nodes).toHaveLength(2);
    expect(elements.edges).toHaveLength(1);
    expect(elements.nodes[0]).toMatchObject({
      id: 'User',
      type: 'erdEntity',
      sourcePosition: 'right',
      targetPosition: 'left',
      draggable: false,
      selectable: false,
      data: { name: 'User', columns: userColumns },
    });
    expect(elements.edges[0]).toMatchObject({
      id: 'Order-user-User-0',
      source: 'Order',
      target: 'User',
      sourceHandle: 'source-left',
      targetHandle: 'target-right',
      type: 'erdRelation',
      selectable: false,
      data: {
        fromCardinality: 'O<',
        toCardinality: '||',
        label: 'user',
      },
    });
    expect('curveOffset' in elements.edges[0].data!).toBe(false);
  });

  test('connects relation endpoints on the inner sides of visually separated tables', () => {
    const elements = buildErdFlowElements({
      entities: [
        { name: 'Parent', columns: userColumns },
        { name: 'Child', columns: orderColumns },
      ],
      relations: [
        { from: 'Parent', fromCardinality: '||', to: 'Child', toCardinality: 'O<', label: 'children' },
      ],
    });

    expect(elements.edges[0]).toMatchObject({
      source: 'Parent',
      target: 'Child',
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
    });
  });
});

describe('buildEndpointSymbolGeometry', () => {
  test('builds SVG primitives for zero-or-many endpoint symbols', () => {
    const geometry = buildEndpointSymbolGeometry({
      x: 100,
      y: 40,
      towardX: 160,
      towardY: 40,
      symbol: 'O<',
    });

    expect(geometry.map(item => item.type)).toEqual(['circle', 'line', 'line']);
    expect(geometry[0]).toMatchObject({ type: 'circle', cy: 40 });
    expect(geometry[0].type === 'circle' && geometry[0].cx).toBeGreaterThan(100);
  });

  test('builds two bars for exactly-one endpoint symbols', () => {
    const geometry = buildEndpointSymbolGeometry({
      x: 100,
      y: 40,
      towardX: 160,
      towardY: 40,
      symbol: '||',
    });

    expect(geometry).toHaveLength(2);
    expect(geometry.every(item => item.type === 'line')).toBe(true);
  });
});
