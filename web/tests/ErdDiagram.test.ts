import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErdDiagram } from '../src/components/ErdDiagram';
import { buildEntityLayout, buildErdFlowElements, buildRelationConnector } from '../src/components/ErdDiagramGeometry';

const userBox = { x: 48, y: 64, height: 94 };
const orderBox = { x: 388, y: 64, height: 94 };

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
        { name: 'User', fields: ['Long id PK', 'String email UK'] },
        { name: 'Order', fields: ['Long id PK', 'BigDecimal amount', 'Long user_id'] },
        { name: 'Trans', fields: ['Long tid PK', 'String customer', 'Long user_id'] },
      ],
      relations: [
        { from: 'Order', fromCardinality: '}o', to: 'User', toCardinality: '||', label: 'user' },
        { from: 'Trans', fromCardinality: '}o', to: 'User', toCardinality: '||', label: 'user' },
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
          { name: 'User', fields: ['Long id PK'] },
          { name: 'Order', fields: ['Long id PK'] },
        ],
        relations: [
          { from: 'Order', fromCardinality: '}o', to: 'User', toCardinality: '||', label: 'user' },
        ],
      },
    }));

    expect(markup).toContain('react-flow');
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
        { name: 'User', fields: ['Long id PK', 'String email UK'] },
        { name: 'Order', fields: ['Long id PK', 'BigDecimal amount'] },
      ],
      relations: [
        { from: 'Order', fromCardinality: '}o', to: 'User', toCardinality: '||', label: 'user' },
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
      data: { name: 'User', fields: ['Long id PK', 'String email UK'] },
    });
    expect(elements.edges[0]).toMatchObject({
      id: 'Order-user-User-0',
      source: 'Order',
      target: 'User',
      type: 'erdRelation',
      selectable: false,
      data: {
        fromCardinality: '}o',
        toCardinality: '||',
        label: 'user',
      },
    });
  });
});
