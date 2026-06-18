"""
Recompute the coach_summary table from live attendance.

Reads kbc_attendance (KBC database) for the latest 10 year-weeks, computes each
coach's weekly absence ratio + the company "vs" figures, and overwrites the
coach_summary table in the default database.

Week 1 column = most recent year-week, week 10 column = oldest of the window,
matching how the dashboard reads weeks[0] as "this week".

Usage:
    python manage.py recompute_coach_summary
    python manage.py recompute_coach_summary --weeks 10
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from api.attendance_compute import recent_weeks, compute_week_summary, _active_students_per_coach, _connect


class Command(BaseCommand):
    help = "Recompute coach_summary from the live kbc_attendance data."

    def add_arguments(self, parser):
        parser.add_argument("--weeks", type=int, default=10, help="Number of weeks (columns) to fill. Default 10.")

    def handle(self, *args, **options):
        n = options["weeks"]
        weeks = recent_weeks(n)  # newest first
        self.stdout.write(f"Computing {n} year-weeks: {[f'{y}-W{w}' for y, w in weeks]}")

        with _connect() as kbc:
            summary = compute_week_summary(weeks, conn=kbc)
            students = _active_students_per_coach(kbc)

        week_keys = [f"{y}-{w}" for (y, w) in weeks]

        owners = set(students)
        for key in week_keys:
            owners.update(summary[key]["coaches"].keys())

        # Build a row per coach. weeks[0] -> week_1_* columns, etc.
        rows = []
        for owner in sorted(owners):
            ratios = []
            week_ratio = []
            week_vs = []
            for key in week_keys:
                cell = summary[key]["coaches"].get(owner)
                r = cell["ratio"] if cell else 0.0
                vs = cell["vsCompany"] if cell else 0.0
                week_ratio.append(r)
                week_vs.append(vs)
                ratios.append(r)
            avg = round(sum(ratios) / len(ratios), 2) if ratios else 0.0
            w1 = summary[week_keys[0]]["coaches"].get(owner)
            rows.append({
                "coach_name": owner,
                "students_count": students.get(owner, 0),
                "last_10_weeks_absence_ratio": avg,
                "week_ratio": week_ratio,
                "week_vs": week_vs,
                "week_1_absent": (w1["absent"] if w1 else 0),
                "week_1_present": (w1["present"] if w1 else 0),
                "week_1_expected": (w1["total"] if w1 else 0),
            })

        # Company row.
        comp_ratios = [summary[k]["company"]["ratio"] for k in week_keys]
        comp_avg = round(sum(comp_ratios) / len(comp_ratios), 2) if comp_ratios else 0.0
        comp_w1 = summary[week_keys[0]]["company"]
        rows.append({
            "coach_name": "OVERALL COMPANY",
            "students_count": sum(students.values()),
            "last_10_weeks_absence_ratio": comp_avg,
            "week_ratio": comp_ratios,
            "week_vs": [100.0] * len(week_keys),
            "week_1_absent": comp_w1["absent"],
            "week_1_present": comp_w1["present"],
            "week_1_expected": comp_w1["total"],
        })

        self._write(rows, n)
        self.stdout.write(self.style.SUCCESS(
            f"coach_summary overwritten: {len(rows)} rows (incl. OVERALL COMPANY)."
        ))

    @transaction.atomic
    def _write(self, rows, n):
        # Column layout of coach_summary (see api/models.py / test.py).
        ratio_cols = [f"week_{i}_absence_ratio" for i in range(1, 11)]
        company_cols = [f"week{i}/ company" for i in range(1, 11)]

        with connection.cursor() as cur:
            cur.execute("DELETE FROM coach_summary")
            for r in rows:
                cols = [
                    "coach_name", "students_count", "last_10_weeks_absence_ratio",
                    "week_1_expected", "week_1_present", "week_1_absent",
                ]
                vals = [
                    r["coach_name"], r["students_count"], Decimal(str(r["last_10_weeks_absence_ratio"])),
                    str(r["week_1_expected"]), str(r["week_1_present"]), r["week_1_absent"],
                ]
                for i in range(10):
                    ratio = r["week_ratio"][i] if i < len(r["week_ratio"]) else 0.0
                    vs = r["week_vs"][i] if i < len(r["week_vs"]) else 0.0
                    cols.append(ratio_cols[i])
                    vals.append(Decimal(str(ratio)))
                    cols.append(company_cols[i])
                    vals.append(str(vs))

                placeholders = ", ".join(["%s"] * len(cols))
                col_sql = ", ".join('"%s"' % c for c in cols)
                cur.execute(
                    f'INSERT INTO coach_summary ({col_sql}) VALUES ({placeholders})',
                    vals,
                )
