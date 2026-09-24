CREATE TABLE "SignatureDayDesign" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "previewUrls" JSONB NOT NULL,
    "printUrls" JSONB NOT NULL,
    "sourceUrls" JSONB NOT NULL,
    "shirtSizes" JSONB NOT NULL,
    "backPrint" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SignatureDayDesign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SignatureDayDesign_shop_createdAt_idx" ON "SignatureDayDesign"("shop", "createdAt");
