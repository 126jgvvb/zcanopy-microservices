/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { useAdminData, Panel, LoadingState, ErrorState } from "@/components/ui";
import { adminApi } from "@/lib/api";

const QUERY_PRESENCE = ["all", "with_query", "no_query"] as const;

const PAGE_SIZE = 20;

function sortByIdDesc(searches: any[]): any[] {
  return [...searches].sort((a, b) => {
    const numA = parseInt(a.id?.replace(/\D/g, "") || "0", 10) || 0;
    const numB = parseInt(b.id?.replace(/\D/g, "") || "0", 10) || 0;
    return numB - numA;
  });
}

export default function SearchesPage() {
  const [customerId, setCustomerId] = useState("");
  const [query, setQuery] = useState("");
  const [queryPresence, setQueryPresence] = useState<(typeof QUERY_PRESENCE)[number]>("all");
  const [propertyType, setPropertyType] = useState("");
  const [location, setLocation] = useState("");
  const [brokerCode, setBrokerCode] = useState("");
  const [brokerBrandName, setBrokerBrandName] = useState("");
  const [subCounty, setSubCounty] = useState("");
  const [district, setDistrict] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const searches = useAdminData(
    (token) =>
      adminApi.searches(token, page, PAGE_SIZE, {
        customerId: customerId || undefined,
        query: query || undefined,
        propertyType: propertyType || undefined,
        location: location || undefined,
        brokerCode: brokerCode || undefined,
        brokerBrandName: brokerBrandName || undefined,
        subCounty: subCounty || undefined,
        district: district || undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }),
    [
      page,
      customerId,
      query,
      propertyType,
      location,
      brokerCode,
      brokerBrandName,
      subCounty,
      district,
      minPrice,
      maxPrice,
      fromDate,
      toDate,
    ],
  );

  const data = searches.data as { searches?: any[]; total?: number } | undefined;

  const sortedSearches = sortByIdDesc(data?.searches ?? []);

  const filtered = sortedSearches.filter((s: any) => {
    if (queryPresence === "with_query" && !s.query) return false;
    if (queryPresence === "no_query" && s.query) return false;
    return true;
  });

  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatFilters = (filters: any) => {
    if (!filters || typeof filters === "string") {
      try {
        const parsed = filters ? JSON.parse(filters) : {};
        return Object.entries(parsed)
          .filter(([_, v]) => v !== undefined && v !== "" && v !== null)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
      } catch {
        return "";
      }
    }
    return Object.entries(filters)
      .filter(([_, v]) => v !== undefined && v !== "" && v !== null)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  };

  const resetFilters = () => {
    setCustomerId("");
    setQuery("");
    setPropertyType("");
    setLocation("");
    setBrokerCode("");
    setBrokerBrandName("");
    setSubCounty("");
    setDistrict("");
    setMinPrice("");
    setMaxPrice("");
    setFromDate("");
    setToDate("");
    setQueryPresence("all");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--zcanopy-card-brown)]">
            Customer Searches
          </h2>
          <p className="text-sm text-gray-500">Recent search activity across customer sessions.</p>
        </div>
      </div>

      <Panel title="Filters">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">Customer ID</label>
            <input
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setPage(1);
              }}
              placeholder="Optional customer ID filter"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">Search Query</label>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Optional query filter"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">Property Type</label>
            <input
              value={propertyType}
              onChange={(e) => {
                setPropertyType(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. apartment, villa"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">Location</label>
            <input
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setPage(1);
              }}
              placeholder="Optional location filter"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">Sub County</label>
            <input
              value={subCounty}
              onChange={(e) => {
                setSubCounty(e.target.value);
                setPage(1);
              }}
              placeholder="Optional sub-county filter"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">District</label>
            <input
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value);
                setPage(1);
              }}
              placeholder="Optional district filter"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">Broker Code</label>
            <input
              value={brokerCode}
              onChange={(e) => {
                setBrokerCode(e.target.value);
                setPage(1);
              }}
              placeholder="Optional broker code filter"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">Broker Brand Name</label>
            <input
              value={brokerBrandName}
              onChange={(e) => {
                setBrokerBrandName(e.target.value);
                setPage(1);
              }}
              placeholder="Optional broker brand filter"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">Min Price</label>
            <input
              type="number"
              value={minPrice}
              onChange={(e) => {
                setMinPrice(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. 5000000"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">Max Price</label>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. 10000000"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--zcanopy-surface)] px-4 py-2.5 text-sm outline-none"
            />
          </div>
          <div className="flex-1 min-w-[160px] flex items-end">
            <button
              onClick={resetFilters}
              className="w-full rounded-xl border border-[var(--zcanopy-primary)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--zcanopy-primary)] hover:bg-[var(--zcanopy-primary)] hover:text-white transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </Panel>

      <Panel title={`Searches (${filtered.length} on this page)`}>
        {searches.loading ? (
          <LoadingState label="Loading searches" />
        ) : searches.error ? (
          <ErrorState message={searches.error} />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No searches found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-gray-400">
                <tr>
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">Customer ID</th>
                  <th className="py-2 pr-4">Query</th>
                  <th className="py-2 pr-4">Location</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Radius (km)</th>
                  <th className="py-2 pr-4">Price Range</th>
                  <th className="py-2 pr-4">County / District</th>
                  <th className="py-2 pr-4">Filters</th>
                  <th className="py-2 pr-4">Result Count</th>
                  <th className="py-2 pr-4">Result Property IDs</th>
                  <th className="py-2">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s: any) => (
                  <tr key={s.id} className="hover:bg-[#D1A054]/5 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs">{s.id}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{s.customerId || "—"}</td>
                    <td className="py-2.5 pr-4">{s.query || "—"}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{s.location || "—"}</td>
                    <td className="py-2.5 pr-4">{s.propertyType || "—"}</td>
                    <td className="py-2.5 pr-4">{s.radius ? `${s.radius} km` : "—"}</td>
                    <td className="py-2.5 pr-4">
                      {s.minPrice || s.maxPrice ? `${s.minPrice || 0} — ${s.maxPrice || 0}` : "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      {s.subCounty || s.district ? `${s.subCounty || ""} / ${s.district || ""}` : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-500">
                      {formatFilters(s.filters) || "—"}
                    </td>
                    <td className="py-2.5 pr-4">{s.resultCount ?? 0}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">
                      {Array.isArray(s.resultPropertyIds) && s.resultPropertyIds.length > 0
                        ? s.resultPropertyIds.slice(0, 5).join(", ") + (s.resultPropertyIds.length > 5 ? ` +${s.resultPropertyIds.length - 5} more` : "")
                        : "—"}
                    </td>
                    <td className="py-2.5 text-gray-500">
                      {s.createdAt ? new Date(s.createdAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          disabled={page <= 1 || searches.loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="hover-gold rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm disabled:opacity-50"
        >
          Previous
        </button>
        <span className="px-3 py-2 text-sm text-gray-500">
          Page {page} of {lastPage}
        </span>
        <button
          disabled={page >= lastPage || searches.loading}
          onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
          className="hover-gold rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm disabled:opacity-50"
        >
          Next
        </button>
        <span className="px-3 py-2 text-sm text-gray-400">
          {total} search{total === 1 ? "" : "es"}
        </span>
      </div>
    </div>
  );
}
