import { runOmnibeesAvailabilityQuery } from "../src/services/omnibees-availability.js";

async function main() {
  const data = await runOmnibeesAvailabilityQuery({
    checkIn: "2026-04-20",
    checkOut: "2026-04-23",
    adults: 2,
    children: 0,
  });
  console.log("rooms:", data.rooms.length);
  console.log("summary:\n", data.summaryText);
  console.log("bookingUrl (listagem hotelresults):\n", data.bookingUrl);
  console.log("hotelListingUrl:\n", data.hotelListingUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
