"use client";
import { useParams } from "next/navigation";
import { CustomersScreen } from "../CustomersScreen";
export default function CustomerPage() {
  const { customerId } = useParams<{ customerId: string }>();
  return <CustomersScreen selectedCustomerId={customerId} />;
}
