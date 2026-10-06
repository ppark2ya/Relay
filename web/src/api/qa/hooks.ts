import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as client from './client'; import type { QACaseInput } from './types';
const keys={cases:['qa','cases'] as const,topics:['qa','topics'] as const};
export const useQACases=()=>useQuery({queryKey:keys.cases,queryFn:()=>client.listQACases()});
export const useQATopics=()=>useQuery({queryKey:keys.topics,queryFn:client.listQATopics});
export function useSaveQACase(){const q=useQueryClient();return useMutation({mutationFn:({id,input}:{id?:number;input:QACaseInput})=>id?client.updateQACase(id,input):client.createQACase(input),onSuccess:()=>Promise.all([q.invalidateQueries({queryKey:keys.cases}),q.invalidateQueries({queryKey:keys.topics})])})}
export function useCreateQATopic(){const q=useQueryClient();return useMutation({mutationFn:client.createQATopic,onSuccess:()=>q.invalidateQueries({queryKey:keys.topics})})}
