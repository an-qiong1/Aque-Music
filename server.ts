import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Lyrics Search
  app.get("/api/lyrics", async (req, res) => {
    const { name, artist } = req.query;
    if (!name) return res.status(400).json({ error: "Missing song name" });

    const query = artist ? `${name} ${artist}` : (name as string);

    try {
      // 1. Try NetEase Cloud Music
      console.log(`Searching NetEase for: ${query}`);
      const neteaseSearch = await axios.get(`https://music.163.com/api/search/get/web`, {
        params: { s: query, type: 1, limit: 1 }
      });
      
      const neteaseId = neteaseSearch.data.result?.songs?.[0]?.id;
      if (neteaseId) {
        const neteaseLyric = await axios.get(`https://music.163.com/api/song/lyric`, {
          params: { id: neteaseId, lv: -1, kv: -1, tv: -1 }
        });
        if (neteaseLyric.data.lrc?.lyric) {
          return res.json({ lyrics: neteaseLyric.data.lrc.lyric, source: "NetEase" });
        }
      }

      // 2. Try QQ Music (simplified proxy)
      console.log(`Searching QQ Music for: ${query}`);
      const qqSearch = await axios.get(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp`, {
        params: { p: 1, n: 1, w: query, format: "json" }
      });
      const qqMid = qqSearch.data.data?.song?.list?.[0]?.songmid;
      if (qqMid) {
        const qqLyric = await axios.get(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg`, {
          params: { songmid: qqMid, format: "json", nobase64: 1 },
          headers: { Referer: "https://y.qq.com/" }
        });
        // QQ returns callback in some formats, but format=json should be fine
        if (qqLyric.data.lyric) {
          return res.json({ lyrics: qqLyric.data.lyric, source: "QQ Music" });
        }
      }

      // 3. Try Kugou
      console.log(`Searching Kugou for: ${query}`);
      const kugouSearch = await axios.get(`http://mobilecdn.kugou.com/api/v3/search/song`, {
        params: { format: "json", keyword: query, page: 1, pagesize: 1 }
      });
      const kugouHash = kugouSearch.data.data?.info?.[0]?.hash;
      if (kugouHash) {
        const kugouLyric = await axios.get(`http://krcs.kugou.com/search`, {
          params: { ver: 1, man: "yes", client: "mobi", hash: kugouHash }
        });
        // Kugou KRC is encrypted, but some endpoints return standard LRC or we handle search differently
        // For simplicity, if we don't have a reliable simple LRC endpoint, we might skip or use basic info
        // Let's try another Kugou endpoint
        const kgDetail = await axios.get(`http://www.kugou.com/yy/index.php?r=play/getdata&hash=${kugouHash}`);
        if (kgDetail.data.data?.lyrics) {
            return res.json({ lyrics: kgDetail.data.data.lyrics, source: "Kugou" });
        }
      }

      res.status(404).json({ error: "Lyrics not found" });
    } catch (error) {
      console.error("Lyrics search error:", error);
      res.status(500).json({ error: "Failed to search lyrics" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
