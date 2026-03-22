import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music, Mic, BarChart3, MessageCircle, ArrowRight, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { Song } from "@shared/schema";

export default function Dashboard() {
  const { data: songs, isLoading } = useQuery<Song[]>({
    queryKey: ["/api/songs"],
  });

  const activeSongs = songs?.filter(s => s.isActive) || [];
  const hasSongs = activeSongs.length > 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Welcome back</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {hasSongs
            ? `You're working on ${activeSongs.length} song${activeSongs.length > 1 ? "s" : ""}. Keep going.`
            : "Let's get started by adding a song to practice."}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {hasSongs ? (
          <>
            <Link href="/practice">
              <Card className="cursor-pointer hover-elevate transition-all" data-testid="card-practice">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <Mic className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">Start practicing</p>
                    <p className="text-xs text-muted-foreground">Record and get feedback</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/progress">
              <Card className="cursor-pointer hover-elevate transition-all" data-testid="card-progress">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">Check progress</p>
                    <p className="text-xs text-muted-foreground">See how you've improved</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </>
        ) : (
          <Link href="/songs">
            <Card className="cursor-pointer hover-elevate transition-all col-span-full" data-testid="card-add-song">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Add your first song</p>
                  <p className="text-xs text-muted-foreground">Upload a track or enter lyrics to start practicing</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {/* Active Songs */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : hasSongs ? (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Your songs</h2>
          <div className="space-y-2">
            {activeSongs.map((song) => (
              <Link key={song.id} href={`/songs/${song.id}`}>
                <Card className="cursor-pointer hover-elevate" data-testid={`card-song-${song.id}`}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <Music className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{song.title}</p>
                      {song.artist && (
                        <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Today's tip */}
      <Card className="bg-primary/5 border-primary/10" data-testid="card-tip">
        <CardContent className="p-5">
          <p className="text-sm font-medium mb-1">Quick tip</p>
          <p className="text-sm text-muted-foreground">
            Focus on just 1-3 lines at a time. Getting a few lines really solid is better than running through a whole song loosely. Pick your hook and let's go deep on it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
