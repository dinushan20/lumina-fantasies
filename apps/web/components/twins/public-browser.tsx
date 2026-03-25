"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, MessageCircleHeart, RefreshCcw, Search, ShieldCheck, Sparkles } from "lucide-react";

import { getPublicTwins, type DigitalTwinResponse, type ProfileResponse } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface PublicTwinsBrowserProps {
  initialProfile: ProfileResponse | null;
}

export function PublicTwinsBrowser({ initialProfile }: PublicTwinsBrowserProps) {
  const [profile] = useState(initialProfile);
  const [twins, setTwins] = useState<DigitalTwinResponse[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    void loadTwins();
  }, []);

  async function loadTwins(options?: { silent?: boolean }) {
    if (options?.silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const nextTwins = await getPublicTwins();
      setTwins(nextTwins);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load the public twin catalog.");
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }

  const allKinkFilters = useMemo(() => {
    const collected = twins.flatMap((twin) => twin.reference_data.allowed_kinks);
    return ["all", ...Array.from(new Set(collected.map((item) => item.trim()).filter(Boolean))).slice(0, 8)];
  }, [twins]);

  const filteredTwins = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return twins.filter((twin) => {
      const matchesFilter = activeFilter === "all" || twin.reference_data.allowed_kinks.some((tag) => tag.toLowerCase() === activeFilter.toLowerCase());
      const matchesSearch =
        !normalizedSearch ||
        twin.name.toLowerCase().includes(normalizedSearch) ||
        twin.description.toLowerCase().includes(normalizedSearch) ||
        twin.reference_data.personality_traits.some((trait) => trait.toLowerCase().includes(normalizedSearch));
      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, search, twins]);

  const featuredTwins = useMemo(
    () =>
      [...twins]
        .sort((left, right) => {
          if (left.required_subscription_tier === right.required_subscription_tier) {
            return right.moderation_score - left.moderation_score;
          }
          return tierOrder[left.required_subscription_tier] - tierOrder[right.required_subscription_tier];
        })
        .slice(0, 2),
    [twins]
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-orange-400/15">
          <CardContent className="p-6">
            <p className="section-kicker">Your access</p>
            <p className="mt-3 font-display text-4xl capitalize text-white">{profile?.subscription_tier ?? "free"}</p>
            <p className="mt-2 text-sm leading-6 text-orange-50/75">
              Only admin-approved twins appear here, and every message still routes through live moderation before it reaches chat.
            </p>
          </CardContent>
        </Card>
        <Card className="border-white/10">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Explore approved companions</CardTitle>
              <CardDescription>Filter by kink tags, skim featured twins, and jump straight into chat when your tier allows it.</CardDescription>
            </div>
            <Button disabled={isRefreshing} onClick={() => void loadTwins({ silent: true })} type="button" variant="outline">
              <RefreshCcw className="mr-2 h-4 w-4" />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-300" />
              Featured twins
            </CardTitle>
            <CardDescription>Highlighted creator companions with clear persona framing and rich safety metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <>
                <Skeleton className="h-32 w-full rounded-[28px]" />
                <Skeleton className="h-32 w-full rounded-[28px]" />
              </>
            ) : featuredTwins.length ? (
              featuredTwins.map((twin) => (
                <div key={twin.id} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-100">
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                      featured
                    </Badge>
                    <Badge className="border-white/10 bg-white/5 text-orange-50/70">{twin.required_subscription_tier}</Badge>
                  </div>
                  <h3 className="mt-4 font-display text-3xl text-white">{twin.name}</h3>
                  <p className="mt-3 text-sm leading-7 text-orange-50/80">{twin.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {twin.reference_data.allowed_kinks.slice(0, 4).map((tag) => (
                      <Badge key={tag} className="border-white/10 bg-white/5 text-orange-50/70">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-muted-foreground">
                Featured twins will appear here once approved creators go live.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-white/10">
            <CardHeader>
              <CardTitle>Filter catalog</CardTitle>
              <CardDescription>Browse by allowed kink tags or search for specific personality cues.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, tone, or personality..."
                  value={search}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {allKinkFilters.map((filter) => (
                  <button
                    key={filter}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      activeFilter === filter
                        ? "border-orange-300/40 bg-orange-500/10 text-white"
                        : "border-white/10 bg-white/5 text-orange-50/75 hover:bg-white/10"
                    }`}
                    onClick={() => setActiveFilter(filter)}
                    type="button"
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-72 w-full rounded-[28px]" />
              ))}
            </div>
          ) : filteredTwins.length ? (
            <div className="grid gap-5 md:grid-cols-2">
              {filteredTwins.map((twin) => (
                <Card key={twin.id} className="border-white/10">
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-100">
                        <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                        approved
                      </Badge>
                      <Badge className="border-white/10 bg-white/5 text-orange-50/70">{twin.required_subscription_tier}</Badge>
                    </div>
                    <CardTitle className="mt-3 text-white">{twin.name}</CardTitle>
                    <CardDescription>Created by {twin.creator_email}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-6 text-orange-50/80">{twin.description}</p>

                    <div className="flex flex-wrap gap-2">
                      {twin.reference_data.allowed_kinks.slice(0, 4).map((tag) => (
                        <Badge key={tag} className="border-white/10 bg-white/5 text-orange-50/70">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="space-y-2 text-sm text-orange-50/75">
                      <p>
                        Traits: <span className="text-white">{twin.reference_data.personality_traits.slice(0, 3).join(", ") || "not specified"}</span>
                      </p>
                      <p>
                        Hard limits: <span className="text-white">{twin.reference_data.hard_limits.length}</span>
                      </p>
                    </div>

                    {twin.access.access_message ? (
                      <div className="rounded-[24px] border border-orange-400/20 bg-orange-500/10 p-3 text-sm leading-6 text-orange-100">
                        {twin.access.access_message}
                      </div>
                    ) : null}

                    {twin.access.can_chat ? (
                      <Button asChild className="w-full">
                        <Link href={`/chat?twinId=${twin.id}`}>
                          <MessageCircleHeart className="mr-2 h-4 w-4" />
                          Chat with Twin
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild className="w-full" variant="outline">
                        <Link href="/pricing">Upgrade for voice, unlimited, and twin access</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-white/10">
              <CardContent className="p-8 text-center">
                <div className="mx-auto flex max-w-md flex-col items-center">
                  <div className="rounded-full border border-white/10 bg-white/[0.04] p-4 text-orange-200">
                    <LoaderCircle className="h-5 w-5" />
                  </div>
                  <h2 className="mt-5 font-display text-3xl text-white">No twins match that filter yet</h2>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    Try another tag or clear search to browse the full approved catalog.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

const tierOrder = {
  free: 0,
  basic: 1,
  premium: 2,
  vip: 3
} satisfies Record<DigitalTwinResponse["required_subscription_tier"], number>;
