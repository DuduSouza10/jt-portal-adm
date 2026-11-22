-- AlterTable
ALTER TABLE "User" ADD COLUMN     "registration" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_registration_key" ON "User"("registration");
