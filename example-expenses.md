# Weekend trip expenses
# Format: payer amount people (space or comma separated)
Lena 1250 Lena Lukas Jake Ben
# Mixed spaces and commas, decimal amount
Lukas 640.5 Lukas Emma Marco,Olivia
Jake 2100 Jake Olivia Ben,Mateo # dinner, split with Olivia and Ben
Emma 980 Emma Hannah Marco
# Payer not in the list: Marco paid the whole amount for Mateo
Marco 415 Mateo
Ben 362.75 Ben Lukas,Jake

Hannah 1480 Hannah Ben Emma Olivia Mateo Anna
Mateo 528 Mateo Marco Hannah
# Paid only for themselves: no effect on balances
Olivia 297 Olivia
# A name listed twice gets two shares
Jake 900 Jake Anna Anna Lena
