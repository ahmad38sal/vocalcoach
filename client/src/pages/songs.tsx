import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Music, Plus, ArrowRight, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Song } from "@shared/schema";

export default function Songs() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [lyrics, setLyrics] = useState("");
  const { toast } = useToast();

  const { data: songs, isLoading } = useQuery<Song[]>({
    queryKey: ["/api/songs"],
  });

  const createSong = useMutation({
    mutationFn: async () => {
      const song = await apiRequest("POST", "/api/songs", {
        title,
        artist: artist || null,
        sourceType: "recorded",
        sourceUrl: null,
      });
      const songData = await song.json();

      // Create lines from lyrics
      const lines = lyrics.split("\n").filter(l => l.trim());
      for (let i = 0; i < lines.length; i++) {
        await apiRequest("POST", `/api/songs/${songData.id}/lines`, {
          text: lines[i].trim(),
          orderIndex: i,
        });
      }
      return songData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/songs"] });
      setTitle("");
      setArtist("");
      setLyrics("");
      setOpen(false);
      toast({ title: "Song added", description: "Your song is ready to practice." });
    },
  });

  const deleteSong = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/songs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/songs"] });
    },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">My Songs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Add songs and pick lines to practice</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5" data-testid="button-add-song">
              <Plus className="w-4 h-4" />
              Add Song
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a new song</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label htmlFor="title">Song title</Label>
                <Input
                  id="title"
                  placeholder="e.g. My Hook"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="input-song-title"
                />
              </div>
              <div>
                <Label htmlFor="artist">Artist (optional)</Label>
                <Input
                  id="artist"
                  placeholder="e.g. Your name"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  data-testid="input-song-artist"
                />
              </div>
              <div>
                <Label htmlFor="lyrics">Lyrics / lines (one per line)</Label>
                <Textarea
                  id="lyrics"
                  placeholder={"Got it on my own, new phone, new house, new whip\nIf you ain't putting in the time, you can't tell me shit"}
                  rows={5}
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  data-testid="input-song-lyrics"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the hook or section you want to practice. Each line becomes a separate practice target.
                </p>
              </div>
              <Button
                onClick={() => createSong.mutate()}
                disabled={!title.trim() || !lyrics.trim() || createSong.isPending}
                className="w-full"
                data-testid="button-save-song"
              >
                {createSong.isPending ? "Saving..." : "Add Song"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : songs && songs.length > 0 ? (
        <div className="space-y-2">
          {songs.map((song) => (
            <Card key={song.id} className="hover-elevate" data-testid={`card-song-${song.id}`}>
              <CardContent className="flex items-center gap-3 p-4">
                <Music className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <Link href={`/songs/${song.id}`} className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{song.title}</p>
                  {song.artist && (
                    <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                  )}
                </Link>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => { e.preventDefault(); deleteSong.mutate(song.id); }}
                    data-testid={`button-delete-song-${song.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <Link href={`/songs/${song.id}`}>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card data-testid="card-empty-songs">
          <CardContent className="flex flex-col items-center text-center py-12 px-6">
            <Music className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="font-medium text-sm mb-1">No songs yet</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-xs">
              Add a song with its lyrics, then pick the specific lines you want to master.
            </p>
            <Button onClick={() => setOpen(true)} className="gap-1.5" data-testid="button-empty-add">
              <Plus className="w-4 h-4" />
              Add your first song
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
