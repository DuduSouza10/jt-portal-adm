-- AlterTable
ALTER TABLE "Base" ADD COLUMN     "autoCreated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "feishuDepartmentId" TEXT;

-- AlterTable
ALTER TABLE "Regional" ADD COLUMN     "feishuDepartmentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Base_feishuDepartmentId_key" ON "Base"("feishuDepartmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Regional_feishuDepartmentId_key" ON "Regional"("feishuDepartmentId");
