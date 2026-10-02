export type QAStatus = '대기' | '진행 중' | '완료' | '실패';
export interface QATopic { id: number; name: string; color: string; sortOrder: number; caseCount: number }
export interface QAStep { id?: number; order: number; action: string; expectedResult: string }
export interface QALink { type: 'request' | 'flow'; id: number; name?: string }
export interface QACase { id: number; key: string; topicId?: number; topicName?: string; title: string; description: string; precondition: string; priority: string; status: QAStatus; note: string; steps: QAStep[]; links: QALink[]; createdAt: string; updatedAt: string }
export type QACaseInput = Omit<QACase, 'id' | 'createdAt' | 'updatedAt' | 'topicName'> & { topicName?: string };
