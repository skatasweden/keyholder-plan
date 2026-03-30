SELECT _await_response  v.id           AS voucher_id,
  v.series,
    v.voucher_number,
      v.date,
        v.description,
          vr.id          AS row_id,
            vr.account_number,
              vr.amount,
                vr.dim_number,
                  vr.object_number
                  FROM vouchers vacuumJOIN voucher_rows vr ON vr.voucher_id = v.id
                  WHERE v.id = '12632d84-42ee-4288-b7b4-782ce1a04faf';