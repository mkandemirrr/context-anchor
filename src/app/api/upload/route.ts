import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { chunkDocument, storeDocumentChunks } from "@/lib/rag-engine";

/**
 * POST /api/upload
 *
 * Handles document upload for RAG grounding.
 * Accepts text files (TXT, MD) and extracts text from them.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sessionId = formData.get("sessionId") as string;

    if (!file || !sessionId) {
      return NextResponse.json(
        { error: "File and sessionId are required" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
    ];
    const allowedExtensions = [".txt", ".md", ".csv", ".json"];
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;

    if (
      !allowedTypes.includes(file.type) &&
      !allowedExtensions.includes(ext)
    ) {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Supported: .txt, .md, .csv, .json",
        },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size: 5MB" },
        { status: 400 }
      );
    }

    // Get user from auth
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Extract auth token from request
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) {
      return NextResponse.json(
        { error: "Invalid authentication" },
        { status: 401 }
      );
    }

    // Read file content
    const text = await file.text();

    if (!text || text.trim().length < 10) {
      return NextResponse.json(
        { error: "File is empty or too short" },
        { status: 400 }
      );
    }

    // Chunk the document
    const chunks = chunkDocument(text, file.name);

    // Store chunks with embeddings
    const stored = await storeDocumentChunks(
      sessionId,
      user.id,
      chunks,
      undefined // Will use platform OpenAI key if available
    );

    return NextResponse.json({
      success: true,
      filename: file.name,
      totalChunks: chunks.length,
      storedChunks: stored,
      message: `Document "${file.name}" processed: ${stored} chunks indexed for RAG.`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
