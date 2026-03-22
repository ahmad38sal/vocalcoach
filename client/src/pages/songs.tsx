import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Music, Plus, ArrowRight, Trash2, Upload, Youtube, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Song } from "@shared/schema";

export default function Songs() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [sourceTab, setSourceTab] = useState("lyrics");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [audioSource, setAudioSource] = useState<{ type: string; url: string } | null>(null);
  const { toast } = useToast();

  const { data: songs, isLoading } = useQuery<Song[]>({
    queryKey: ["/api/songs"],
  });

  const createSong = useMutation({
    mutationFn: async () => {
      const song = await apiRequest("POST", "/api/songs", {
        title,
        artist: artist || null,
        sourceType: audioSource ? (audioSource.type === "youtube" ? "youtube" : "upload") : "recorded",
        sourceUrl: audioSource?.url || youtubeUrl || null,
      });
      const songData = await song.json();

      // Create lines from lyrics
      const lineTexts = lyrics.split("\n").filter(l => l.trim());
      for (let i = 0; i < lineTexts.length; i++) {
        await apiRequest("POST", `/api/songs/${songData.id}/lines`, {
          text: lineTexts[i].trim(),
          orderIndex: i,
        });
      }
      return songData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/songs"] });
      resetForm();
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

  const resetForm = () => {
    setTitle("");
    setArtist("");
    setLyrics("");
    setYoutubeUrl("");
    setSourceTab("lyrics");
    setAudioSource(null);
  };

  const handleYoutubeExtract = async () => {
    if (!youtubeUrl.trim()) return;
    setIsExtracting(true);
    try {
      const res = await apiRequest("POST", "/api/youtube-extract", { url: youtubeUrl });
      const data = await res.json();
      if (data.filePath) {
        const filename = data.filePath.split("/").pop() || data.filePath.split("\\").pop();
        setAudioSource({ type: "youtube", url: `/api/audio/${filename}` });
        if (!title.trim() && data.title) setTitle(data.title);
        toast({ title: "Audio extracted", description: "Song audio downloaded from YouTube." });
      }
    } catch (err: any) {
      toast({ title: "Extraction failed", description: "Could not extract audio. Check the URL and try again.", variant: "destructive" });
    }
    setIsExtracting(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("audio", file);
      const res = await fetch("/api/upload-audio", { method: "POST", body: formData });
      const data = await res.json();
      if (data.filePath) {
        const filename = data.filePath.split("/").pop() || data.filePath.split("\\").pop();
        setAudioSource({ type: "upload", url: `/api/audio/${filename}` });
        if (!title.trim()) {
          setTitle(file.name.replace(/\.[^/.]+$/, ""));
        }
        toast({ title: "File uploaded", description: `${file.name} is ready.` });
      }
    } catch {
      toast({ title: "Upload failed", description: "Could not upload the file.", variant: "destructive" });
    }
    setIsUploading(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">My Songs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Add songs and pick lines to practice</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-1.5" data-testid="button-add-song">
              <Plus className="w-4 h-4" />
              Add Song
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
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

              {/* Source tabs */}
              <Tabs value={sourceTab} onValueChange={setSourceTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="lyrics" className="text-xs">Lyrics only</TabsTrigger>
                  <TabsTrigger value="youtube" className="text-xs gap-1">
                    <Youtube className="w-3 h-3" /> YouTube
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="text-xs gap-1">
                    <Upload className="w-3 h-3" /> Upload
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="youtube" className="space-y-3 mt-3">
                  <div>
                    <Label htmlFor="youtube-url">YouTube link</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="youtube-url"
                        placeholder="https://youtube.com/watch?v=..."
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        data-testid="input-youtube-url"
                      />
                      <Button
                        onClick={handleYoutubeExtract}
                        disabled={!youtubeUrl.trim() || isExtracting}
                        size="sm"
                        data-testid="button-extract-youtube"
                      >
                        {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Extract"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Paste a YouTube link and we'll grab the audio for you.
                    </p>
                  </div>
                  {audioSource?.type === "youtube" && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <Music className="w-4 h-4" />
                      Audio extracted — add lyrics below
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="upload" className="space-y-3 mt-3">
                  <div>
                    <Label htmlFor="audio-file">Audio file (MP3, WAV, M4A)</Label>
                    <Input
                      id="audio-file"
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                      className="mt-1"
                      data-testid="input-audio-file"
                    />
                  </div>
                  {isUploading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading...
                    </div>
                  )}
                  {audioSource?.type === "upload" && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <Music className="w-4 h-4" />
                      File uploaded — add lyrics below
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="lyrics" className="mt-0" />
              </Tabs>

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
