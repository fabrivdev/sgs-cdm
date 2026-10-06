import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { FleetSnapshot } from "./model";
import {
  addFleetReading,
  correctFleetReading,
  createFleetVehicle,
  loadFleetSnapshot,
  type AddFleetReadingInput,
  type CorrectFleetReadingInput,
  type CreateFleetVehicleInput,
} from "./api";

const FLEET_QUERY_KEY = "fleet-snapshot";

export function useFleet(previewData?: FleetSnapshot) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [FLEET_QUERY_KEY, user?.id],
    enabled: Boolean(user) && !previewData,
    queryFn: loadFleetSnapshot,
    initialData: previewData,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

function useFleetMutation<TInput>(mutationFn: (input: TInput) => Promise<string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [FLEET_QUERY_KEY] });
    },
  });
}

export function useCreateFleetVehicle() {
  return useFleetMutation<CreateFleetVehicleInput>(createFleetVehicle);
}

export function useAddFleetReading() {
  return useFleetMutation<AddFleetReadingInput>(addFleetReading);
}

export function useCorrectFleetReading() {
  return useFleetMutation<CorrectFleetReadingInput>(correctFleetReading);
}
