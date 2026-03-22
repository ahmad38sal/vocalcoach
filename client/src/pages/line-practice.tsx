import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Star, CheckCircle2, Lightbulb, MessageCircle, Activity } from "lucide-react";
import { Recorder } from "@/components/recorder";
import { LivePitchMonitor } from "@/components/live-pitch-monitor";
import { PitchChart } from "@/components/pitch-chart";
import { LoudnessChart } from "@/components/loudness-chart";
import { analyzePitch, analyzeLoudness, suggestDrills, type DrillSuggestion } from "@/lib/audio-analysis";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Line, Recording, Metrics } from "@shared/schema";

interface AnalysisResult {
  pitchData: Array<{ time: number; freq: number | null; midi: number | null; note: string | null; deviation?: number }>;
  loudnessData: Array<{ time: number; db: number }>;
  drills: DrillSuggestion[];
  greenSegments: number;
  redSegments: number;
  avgDeviation: number;
  energyDropoff: number;
  overallScore: number;
}

export default function LinePractice() {
  const params = useParams<{ lineId: string }>();
  const lineId = Number(params.lineId);
  const { toast } = useToast();

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [referenceData, setReferenceData] = useState<Array<{ time: number; midi: number | null; note: string | null }>>([]);
  const [takeCount, setTakeCount] = useState(0);
  const [activeTab, setActiveTab] = useState("live");

  const { data: line, isLoading: lineLoading } = useQuery<Line>({
    queryKey: ["/api/lines", lineId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/lines/${lineId}`);
      return res.json();
    },
  });

  const { data: recordings } = useQuery<Recording[]>({
    queryKey: ["/api/lines", lineId, "recordings"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/lines/${lineId}/recordings`);
      return res.json();
    },
  });

  // Load existing metrics from backend (persist across navigation)
  const { data: existingMetrics } = useQuery<Metrics[]>({
    queryKey: ["/api/lines", lineId, "metrics"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/lines/${lineId}/metrics`);
      return res.json();
    },
  });

  // Restore last analysis from existing metrics on mount
  useEffect(() => {
    if (existingMetrics && existingMetrics.length > 0 && !analysis) {
      const latest = existingMetrics[existingMetrics.length - 1];
      try {
        const pitchData = latest.pitchData ? JSON.parse(latest.pitchData) : [];
        const loudnessData = latest.loudnessData ? JSON.parse(latest.loudnessData) : [];
        const drills = suggestDrills(pitchData, loudnessData, line?.text || "");
        setAnalysis({
          pitchData,
          loudnessData,
          drills,
          greenSegments: latest.greenSegments || 0,
          redSegments: latest.redSegments || 0,
          avgDeviation: latest.avgPitchDeviation || 0,
          energyDropoff: latest.energyDropoff || 0,
          overallScore: latest.overallScore || 0,
        });
        setTakeCount(existingMetrics.length);
      } catch { /* parse failed */ }
    }
  }, [existingMetrics, analysis, line]);

  // Load reference recording pitch data on mount
  useEffect(() => {
    if (referenceData.length === 0 && lineId) {
      apiRequest("GET", `/api/lines/${lineId}/reference`)
        .then(res => {
          if (res.ok) return res.json();
          return null;
        })
        .then(async (refRec) => {
          if (!refRec?.audioData) return;
          // Decode reference audio and extract pitch
          try {
            const audioCtx = new AudioContext();
            const binary = atob(refRec.audioData);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
            const channelData = audioBuffer.getChannelData(0);
            const pitchResults = analyzePitch(channelData, audioBuffer.sampleRate);
            setReferenceData(pitchResults);
            audioCtx.close();
          } catch { /* reference decode failed */ }
        })
        .catch(() => { /* no reference */ });
    }
  }, [lineId, referenceData.length]);

  const saveRecording = useMutation({
    mutationFn: async (data: { audioData: string; duration: number; isReference: boolean; isBaseline: boolean }) => {
      const res = await apiRequest("POST", `/api/lines/${lineId}/recordings`, data);
      return res.json();
    },
    onSuccess: (recording) => {
      queryClient.invalidateQueries({ queryKey: ["/api/lines", lineId, "recordings"] });

      // Save metrics if we have analysis
      if (analysis) {
        apiRequest("POST", `/api/recordings/${recording.id}/metrics`, {
          pitchData: JSON.stringify(analysis.pitchData),
          loudnessData: JSON.stringify(analysis.loudnessData),
          avgPitchDeviation: analysis.avgDeviation,
          greenSegments: analysis.greenSegments,
          redSegments: analysis.redSegments,
          energyDropoff: analysis.energyDropoff,
          breathCutoffs: 0,
          overallScore: analysis.overallScore,
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/lines", lineId, "metrics"] });
        });

        // Save drill suggestions
        for (const drill of analysis.drills) {
          apiRequest("POST", "/api/drills", {
            recordingId: recording.id,
            lineId,
            type: drill.type,
            title: drill.title,
            description: drill.description,
            targetWords: drill.targetWords || null,
          });
        }
      }
    },
  });

  const handleRecordingComplete = useCallback(async (blob: Blob, audioBuffer: AudioBuffer) => {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Run analysis
    const pitchResults = analyzePitch(channelData, sampleRate);
    const loudnessResults = analyzeLoudness(channelData, sampleRate);

    // Compare with reference if available
    const pitchWithDeviation = pitchResults.map((p) => {
      if (p.midi === null || referenceData.length === 0) return { ...p, deviation: undefined };
      const closest = referenceData
        .filter(r => r.midi !== null)
        .reduce((best, r) => {
          const d = Math.abs(r.time - p.time);
          return d < best.dist ? { midi: r.midi!, dist: d } : best;
        }, { midi: 0, dist: Infinity });

      const deviation = closest.dist < Infinity ? (p.midi - closest.midi) * 100 : undefined;
      return { ...p, deviation };
    });

    // Calculate metrics
    const validDeviations = pitchWithDeviation
      .filter(p => p.deviation !== undefined)
      .map(p => Math.abs(p.deviation!));
    const avgDeviation = validDeviations.length > 0
      ? validDeviations.reduce((a, b) => a + b, 0) / validDeviations.length
      : 0;

    const greenSegments = validDeviations.filter(d => d < 50).length;
    const redSegments = validDeviations.filter(d => d >= 50).length;

    // Energy dropoff
    const thirdLen = Math.max(1, Math.floor(loudnessResults.length / 3));
    const firstThirdAvg = loudnessResults.slice(0, thirdLen).reduce((a, b) => a + b.db, 0) / thirdLen;
    const lastThirdAvg = loudnessResults.slice(-thirdLen).reduce((a, b) => a + b.db, 0) / thirdLen;
    const energyDropoff = Math.max(0, firstThirdAvg - lastThirdAvg);

    // Overall score: weighted combination
    const pitchScore = Math.max(0, 100 - avgDeviation);
    const energyScore = Math.max(0, 100 - energyDropoff * 5);
    const overallScore = pitchScore * 0.7 + energyScore * 0.3;

    const drills = suggestDrills(pitchWithDeviation, loudnessResults, line?.text || "");

    const result: AnalysisResult = {
      pitchData: pitchWithDeviation,
      loudnessData: loudnessResults,
      drills,
      greenSegments,
      redSegments,
      avgDeviation,
      energyDropoff,
      overallScore: Math.round(overallScore),
    };

    setAnalysis(result);
    setTakeCount(prev => prev + 1);
    setActiveTab("feedback");

    // Convert blob to base64 and save
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      saveRecording.mutate({
        audioData: base64,
        duration: audioBuffer.duration,
        isReference: false,
        isBaseline: takeCount === 0 && (!recordings || recordings.length === 0),
      });
    };
    reader.readAsDataURL(blob);
  }, [line, referenceData, takeCount, recordings, saveRecording]);

  const setAsReference = useCallback(async (blob: Blob, audioBuffer: AudioBuffer) => {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const pitchResults = analyzePitch(channelData, sampleRate);
    setReferenceData(pitchResults);
    toast({ title: "Reference set", description: "Your reference melody has been saved for comparison." });

    // Save as reference recording
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      saveRecording.mutate({
        audioData: base64,
        duration: audioBuffer.duration,
        isReference: true,
        isBaseline: false,
      });
    };
    reader.readAsDataURL(blob);
  }, [saveRecording, toast]);

  if (lineLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!line) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground">Line not found.</p>
        <Link href="/practice">
          <Button variant="ghost" className="mt-2 gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to practice
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/practice">
          <Button size="icon" variant="ghost" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Practicing</p>
          <p className="text-base font-medium leading-relaxed" data-testid="text-practice-line">
            "{line.text}"
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="live" data-testid="tab-live" className="gap-1">
            <Activity className="w-3 h-3" /> Live
          </TabsTrigger>
          <TabsTrigger value="record" data-testid="tab-record">Record</TabsTrigger>
          <TabsTrigger value="feedback" data-testid="tab-feedback" disabled={!analysis}>Feedback</TabsTrigger>
          <TabsTrigger value="drills" data-testid="tab-drills" disabled={!analysis}>Drills</TabsTrigger>
        </TabsList>

        {/* Live Pitch Monitor Tab */}
        <TabsContent value="live" className="space-y-4 mt-6">
          <LivePitchMonitor
            referenceNotes={referenceData
              .filter(r => r.midi !== null)
              .map(r => ({ time: r.time, midi: r.midi!, note: r.note! }))}
          />
        </TabsContent>

        {/* Record Tab */}
        <TabsContent value="record" className="space-y-6 mt-6">
          {/* Reference toggle */}
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Reference melody</p>
                  <p className="text-xs text-muted-foreground">
                    {referenceData.length > 0
                      ? "Reference is set. Your takes will be compared to it."
                      : "Record a reference take first — sing the line the way you want it to sound."}
                  </p>
                </div>
                {referenceData.length > 0 && (
                  <Badge variant="secondary" className="text-xs">Set</Badge>
                )}
              </div>
              {referenceData.length === 0 && (
                <div className="mt-3">
                  <Recorder onRecordingComplete={setAsReference} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Main recorder */}
          <div className="pt-4">
            <Recorder onRecordingComplete={handleRecordingComplete} />
          </div>

          {takeCount > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Take #{takeCount} — check the Feedback tab to see your results
            </p>
          )}
        </TabsContent>

        {/* Feedback Tab */}
        <TabsContent value="feedback" className="space-y-6 mt-6">
          {analysis ? (
            <>
              {/* Score */}
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold tabular-nums" data-testid="text-overall-score">
                  {analysis.overallScore}
                </div>
                <div>
                  <p className="text-sm font-medium">Overall score</p>
                  <p className="text-xs text-muted-foreground">
                    {analysis.overallScore >= 80 ? "Sounding great!" :
                     analysis.overallScore >= 60 ? "Getting there — check the drills." :
                     "Keep at it — small improvements add up fast."}
                  </p>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400" data-testid="text-green-segments">
                      {analysis.greenSegments}
                    </p>
                    <p className="text-xs text-muted-foreground">On pitch</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-semibold tabular-nums text-red-500" data-testid="text-red-segments">
                      {analysis.redSegments}
                    </p>
                    <p className="text-xs text-muted-foreground">Off pitch</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-semibold tabular-nums" data-testid="text-energy-dropoff">
                      {analysis.energyDropoff.toFixed(0)}%
                    </p>
                    <p className="text-xs text-muted-foreground">Energy drop</p>
                  </CardContent>
                </Card>
              </div>

              {/* Pitch chart */}
              <div>
                <h3 className="text-sm font-medium mb-2">Pitch over time</h3>
                <PitchChart
                  pitchData={analysis.pitchData}
                  referenceData={referenceData.length > 0 ? referenceData : undefined}
                />
              </div>

              {/* Loudness chart */}
              <div>
                <h3 className="text-sm font-medium mb-2">Energy / volume</h3>
                <LoudnessChart data={analysis.loudnessData} />
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">Record a take first to see your feedback here.</p>
            </div>
          )}
        </TabsContent>

        {/* Drills Tab */}
        <TabsContent value="drills" className="space-y-4 mt-6">
          {analysis && analysis.drills.length > 0 ? (
            analysis.drills.map((drill, i) => (
              <Card key={i} data-testid={`card-drill-${i}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{drill.title}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{drill.description}</p>
                      {drill.targetWords && (
                        <Badge variant="secondary" className="mt-2 text-xs">Focus: "{drill.targetWords}"</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">Record a take to get personalized drill suggestions.</p>
            </div>
          )}

          {analysis && (
            <Link href={`/coach?lineId=${lineId}`}>
              <Button variant="outline" className="w-full gap-2 mt-4" data-testid="button-ask-coach">
                <MessageCircle className="w-4 h-4" />
                Ask a question about this feedback
              </Button>
            </Link>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
