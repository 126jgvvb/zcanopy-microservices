/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";

const QUERY_PRESENCE = ["all", "with_query", "no_query"] as const;

interface SearchFiltersProps {
  filters: {
    customerId?: string;
    query?: string;
    queryPresence?: (typeof QUERY_PRESENCE)[number];
    propertyType?: string;
    location?: string;
    brokerCode?: string;
    brokerBrandName?: string;
    subCounty?: string;
    district?: string;
    minPrice?: string;
    maxPrice?: string;
    fromDate?: string;
    toDate?: string;
  };
  onChange: (filters: any) => void;
  onReset?: () => void;
}

const InputField = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) => (
  <div className="flex-1 min-w-[160px]">
    <label className="block text-xs font-medium text-gray-500">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
    />
  </div>
);

export default function SearchFilters({ filters, onChange, onReset }: SearchFiltersProps) {
  const updateField = (key: string, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <InputField
        label="Customer ID"
        value={filters.customerId || ""}
        onChange={(v) => updateField("customerId", v || undefined)}
        placeholder="Optional customer ID filter"
      />
      <InputField
        label="Search Query"
        value={filters.query || ""}
        onChange={(v) => updateField("query", v || undefined)}
        placeholder="Optional query filter"
      />
      <InputField
        label="Property Type"
        value={filters.propertyType || ""}
        onChange={(v) => updateField("propertyType", v || undefined)}
        placeholder="e.g. apartment, villa"
      />
      <InputField
        label="Location"
        value={filters.location || ""}
        onChange={(v) => updateField("location", v || undefined)}
        placeholder="Optional location filter"
      />
      <InputField
        label="Sub County"
        value={filters.subCounty || ""}
        onChange={(v) => updateField("subCounty", v || undefined)}
        placeholder="Optional sub-county filter"
      />
      <InputField
        label="District"
        value={filters.district || ""}
        onChange={(v) => updateField("district", v || undefined)}
        placeholder="Optional district filter"
      />
      <InputField
        label="Broker Code"
        value={filters.brokerCode || ""}
        onChange={(v) => updateField("brokerCode", v || undefined)}
        placeholder="Optional broker code filter"
      />
      <InputField
        label="Broker Brand Name"
        value={filters.brokerBrandName || ""}
        onChange={(v) => updateField("brokerBrandName", v || undefined)}
        placeholder="Optional broker brand filter"
      />
      <InputField
        label="Min Price"
        value={filters.minPrice || ""}
        onChange={(v) => updateField("minPrice", v || undefined)}
        placeholder="e.g. 5000000"
        type="number"
      />
      <InputField
        label="Max Price"
        value={filters.maxPrice || ""}
        onChange={(v) => updateField("maxPrice", v || undefined)}
        placeholder="e.g. 10000000"
        type="number"
      />
      <InputField
        label="From Date"
        value={filters.fromDate || ""}
        onChange={(v) => updateField("fromDate", v || undefined)}
        type="date"
      />
      <InputField
        label="To Date"
        value={filters.toDate || ""}
        onChange={(v) => updateField("toDate", v || undefined)}
        type="date"
      />
      <div className="flex-1 min-w-[160px] flex items-end">
        <div className="mt-1 flex gap-2 w-full">
          {QUERY_PRESENCE.map((qp) => (
            <button
              key={qp}
              onClick={() => updateField("queryPresence", qp)}
              className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition-all ${
                (filters.queryPresence || "all") === qp
                  ? "text-white shadow-md"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
              style={
                (filters.queryPresence || "all") === qp
                  ? { backgroundColor: "var(--zcanopy-primary)" }
                  : {}
              }
            >
              {qp === "all" ? "All" : qp === "with_query" ? "With query" : "No query"}
            </button>
          ))}
        </div>
      </div>
      {onReset && (
        <div className="flex-1 min-w-[160px] flex items-end">
          <button
            onClick={onReset}
            className="w-full rounded-xl border border-[var(--zcanopy-primary)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--zcanopy-primary)] hover:bg-[var(--zcanopy-primary)] hover:text-white transition-colors"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
