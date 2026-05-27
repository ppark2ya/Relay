import { useState } from 'react';
import { useFlow, useUpdateFlow } from '../../api/flows';
import type { Flow } from '../../types';

export function useFlowForm(
  flow: Flow | null,
  onUpdate: (flow: Flow) => void,
) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [syncedFlowId, setSyncedFlowId] = useState<number | null>(null);

  const { data: flowData } = useFlow(flow?.id || 0);
  const updateFlow = useUpdateFlow();

  // Render-time sync when flow data changes
  if (flowData && flowData.id !== syncedFlowId) {
    setSyncedFlowId(flowData.id);
    setName(flowData.name);
    setDescription(flowData.description || '');
  }

  const handleSave = () => {
    if (flow) {
      updateFlow.mutate({
        id: flow.id,
        data: { name, description },
      }, {
        onSuccess: (data) => onUpdate(data),
      });
    }
  };

  return {
    name, setName,
    description, setDescription,
    isEditingName, setIsEditingName,
    flowData,
    updateFlow,
    handleSave,
  };
}
