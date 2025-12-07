import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { Location } from "@shared/schema";

interface SelectionContextType {
  isSelecting: boolean;
  selectedLocations: Location[];
  toggleSelection: () => void;
  selectLocation: (location: Location) => void;
  deselectLocation: (locationId: string) => void;
  clearSelection: () => void;
  isSelected: (locationId: string) => boolean;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);

  const toggleSelection = useCallback(() => {
    setIsSelecting((prev) => {
      if (prev) {
        setSelectedLocations([]);
      }
      return !prev;
    });
  }, []);

  const selectLocation = useCallback((location: Location) => {
    setSelectedLocations((prev) => {
      if (prev.some((l) => l.id === location.id)) {
        return prev;
      }
      return [...prev, location];
    });
  }, []);

  const deselectLocation = useCallback((locationId: string) => {
    setSelectedLocations((prev) => prev.filter((l) => l.id !== locationId));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedLocations([]);
    setIsSelecting(false);
  }, []);

  const isSelected = useCallback(
    (locationId: string) => selectedLocations.some((l) => l.id === locationId),
    [selectedLocations]
  );

  return (
    <SelectionContext.Provider
      value={{
        isSelecting,
        selectedLocations,
        toggleSelection,
        selectLocation,
        deselectLocation,
        clearSelection,
        isSelected,
      }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error("useSelection must be used within a SelectionProvider");
  }
  return context;
}
